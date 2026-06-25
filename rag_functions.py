#!/usr/bin/env python3
"""
RAG System for THI-V01 Functions Documentation
=============================================

This script creates a Retrieval-Augmented Generation (RAG) system for the
functions documentation in tests/fonctions/ directory.

The vector database is stored at the project root as 'functions_rag_db/'
and is designed to be used exclusively by Mistral Vibe.

Usage:
    python rag_functions.py --build      # Build/index the RAG database
    python rag_functions.py --query "search term"  # Query the RAG
    python rag_functions.py --reset     # Reset and rebuild the database
    python rag_functions.py --stats     # Show database statistics
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import List, Dict, Any
import chromadb
from chromadb.utils import embedding_functions

# Configuration
RAG_DB_PATH = "functions_rag_db"  # At project root
SOURCE_DIR = "tests/fonctions"
CHUNK_SIZE = 1000  # Character-based chunk size
CHUNK_OVERLAP = 200
MIN_CHUNK_SIZE = 100

# Use ChromaDB's default embedding function (no external dependencies)
# This uses a lightweight all-MiniLM-L6-v2 model bundled with ChromaDB

class FunctionsRAG:
    """RAG system for THI-V01 functions documentation."""
    
    def __init__(self, db_path: str = RAG_DB_PATH):
        """Initialize the RAG system."""
        self.db_path = Path(db_path)
        self.client = None
        self.collection = None
        self.embedding_function = None
        
    def _get_embedding_function(self):
        """Get or create the embedding function."""
        if self.embedding_function is None:
            # Use ChromaDB's default embedding (all-MiniLM-L6-v2)
            self.embedding_function = embedding_functions.DefaultEmbeddingFunction()
        return self.embedding_function
    
    def _get_client(self):
        """Get or create the ChromaDB client."""
        if self.client is None:
            self.client = chromadb.PersistentClient(path=str(self.db_path))
        return self.client
    
    def reset_database(self):
        """Reset the entire database."""
        if self.db_path.exists():
            import shutil
            shutil.rmtree(self.db_path)
            print(f"✓ Database reset: {self.db_path}")
        self.client = None
        self.collection = None
    
    def _load_documents(self) -> List[Dict[str, Any]]:
        """Load all markdown files from the source directory."""
        source_path = Path(SOURCE_DIR)
        documents = []
        
        if not source_path.exists():
            raise FileNotFoundError(f"Source directory not found: {source_path}")
        
        # Find all .md files
        md_files = list(source_path.rglob("*.md"))
        print(f"Found {len(md_files)} markdown files in {SOURCE_DIR}")
        
        for md_file in md_files:
            try:
                with open(md_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Extract metadata
                relative_path = str(md_file.relative_to(source_path))
                
                # Try to extract title from first line
                title = "Untitled"
                if content.startswith('# '):
                    title = content.split('\n')[0][2:].strip()
                
                documents.append({
                    'path': relative_path,
                    'full_path': str(md_file),
                    'content': content,
                    'title': title,
                    'size': len(content)
                })
                
            except Exception as e:
                print(f"Warning: Could not read {md_file}: {e}")
        
        return documents
    
    def _chunk_document(self, text: str, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Split a document into chunks."""
        chunks = []
        
        # Simple chunking by paragraphs/sections
        # Split by double newline first (paragraphs)
        paragraphs = text.split('\n\n')
        
        current_chunk = ""
        current_chunk_metadata = metadata.copy()
        current_chunk_metadata['chunk_index'] = 0
        
        for i, para in enumerate(paragraphs):
            para = para.strip()
            if not para:
                continue
            
            # Check if adding this paragraph would exceed chunk size
            if len(current_chunk) + len(para) + 2 > CHUNK_SIZE:
                # Save current chunk
                if len(current_chunk) >= MIN_CHUNK_SIZE:
                    chunks.append({
                        'text': current_chunk,
                        'metadata': current_chunk_metadata
                    })
                
                # Start new chunk
                current_chunk = para
                current_chunk_metadata = metadata.copy()
                current_chunk_metadata['chunk_index'] = len(chunks)
            else:
                current_chunk += ("\n\n" if current_chunk else "") + para
        
        # Add the last chunk
        if current_chunk:
            chunks.append({
                'text': current_chunk,
                'metadata': current_chunk_metadata
            })
        
        return chunks
    
    def _extract_function_sections(self, text: str, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract individual function sections from markdown."""
        import re
        
        chunks = []
        
        # Pattern to match function sections: ## `id` — description
        function_pattern = re.compile(
            r'^##\s+`([^`]+)`\s+—\s+(.+?)$',
            re.MULTILINE
        )
        
        # Split by function sections
        lines = text.split('\n')
        current_function = None
        current_content = []
        
        for line in lines:
            function_match = function_pattern.match(line)
            
            if function_match:
                # Save previous function if exists
                if current_function and current_content:
                    # Check if we have a modification tag
                    is_modified = '[modification]' in '\n'.join(current_content).lower()
                    
                    chunks.append({
                        'text': '\n'.join(current_content),
                        'metadata': {
                            **metadata,
                            'function_id': current_function[0],
                            'function_desc': current_function[1],
                            'type': 'function',
                            'is_modified': is_modified
                        }
                    })
                
                # Start new function
                current_function = (function_match.group(1), function_match.group(2))
                current_content = [line]
            elif current_function:
                current_content.append(line)
        
        # Add the last function
        if current_function and current_content:
            is_modified = '[modification]' in '\n'.join(current_content).lower()
            
            chunks.append({
                'text': '\n'.join(current_content),
                'metadata': {
                    **metadata,
                    'function_id': current_function[0],
                    'function_desc': current_function[1],
                    'type': 'function',
                    'is_modified': is_modified
                }
            })
        
        return chunks
    
    def build_index(self, force_reset: bool = False):
        """Build the RAG index from all documents."""
        print("=" * 60)
        print("Building RAG Index for THI-V01 Functions")
        print("=" * 60)
        
        if force_reset:
            self.reset_database()
        
        # Load documents
        documents = self._load_documents()
        print(f"Loaded {len(documents)} documents")
        
        # Initialize ChromaDB
        client = self._get_client()
        embedding_func = self._get_embedding_function()
        
        # Create or get collection
        collection_name = "thi_v01_functions"
        try:
            self.collection = client.get_collection(collection_name)
            print(f"Using existing collection: {collection_name}")
        except:
            self.collection = client.create_collection(
                name=collection_name,
                embedding_function=embedding_func,
                metadata={"description": "THI-V01 Functions Documentation RAG", "project": "THI-V01", "vibe_exclusive": True}
            )
            print(f"Created new collection: {collection_name}")
        
        # Process each document
        all_ids = []
        all_documents = []
        all_metadatas = []
        
        total_chunks = 0
        total_functions = 0
        total_modified = 0
        
        for doc in documents:
            print(f"\nProcessing: {doc['path']} ({doc['size']} chars)")
            
            # Extract function sections (preferred method)
            chunks = self._extract_function_sections(doc['content'], {
                'source': doc['path'],
                'title': doc['title']
            })
            
            # If no function sections found, use regular chunking
            if not chunks:
                chunks = self._chunk_document(doc['content'], {
                    'source': doc['path'],
                    'title': doc['title']
                })
            
            # Add chunks to collection
            for i, chunk in enumerate(chunks):
                chunk_id = f"{doc['path']}_chunk_{i}"
                
                all_ids.append(chunk_id)
                all_documents.append(chunk['text'])
                all_metadatas.append(chunk['metadata'])
                total_chunks += 1
                
                if chunk['metadata'].get('type') == 'function':
                    total_functions += 1
                    if chunk['metadata'].get('is_modified'):
                        total_modified += 1
        
        print(f"\nTotal chunks to index: {total_chunks}")
        print(f"Total functions: {total_functions}")
        print(f"Total modified functions: {total_modified}")
        
        # Add in batches for efficiency
        batch_size = 50
        for i in range(0, len(all_ids), batch_size):
            batch_ids = all_ids[i:i+batch_size]
            batch_docs = all_documents[i:i+batch_size]
            batch_metas = all_metadatas[i:i+batch_size]
            
            self.collection.add(
                ids=batch_ids,
                documents=batch_docs,
                metadatas=batch_metas
            )
            print(f"Indexed batch {i//batch_size + 1}/{(len(all_ids)+batch_size-1)//batch_size}")
        
        # Get collection stats
        collection_info = self.collection.count()
        print(f"\n✓ Indexing complete!")
        print(f"  - Total documents in collection: {collection_info}")
        print(f"  - Database location: {self.db_path.absolute()}")
        print(f"  - Functions indexed: {total_functions}")
        print(f"  - Modified functions: {total_modified}")
        
        return total_chunks
    
    def query(self, query: str, n_results: int = 5, include_metadata: bool = True) -> List[Dict[str, Any]]:
        """Query the RAG database."""
        if self.collection is None:
            self._get_client()
            try:
                self.collection = self.client.get_collection("thi_v01_functions")
            except:
                raise Exception("Collection not found. Please build the index first with: python rag_functions.py --build")
        
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results
        )
        
        # Format results
        formatted_results = []
        for i in range(len(results['ids'][0])):
            result = {
                'id': results['ids'][0][i],
                'document': results['documents'][0][i],
                'distance': results['distances'][0][i],
                'metadata': results['metadatas'][0][i] if results['metadatas'] else {}
            }
            
            # Add similarity score (convert distance to similarity)
            result['similarity'] = 1 - result['distance']
            
            if include_metadata:
                formatted_results.append(result)
            else:
                formatted_results.append({
                    'document': result['document'],
                    'similarity': result['similarity']
                })
        
        return formatted_results
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the RAG database."""
        if self.collection is None:
            self._get_client()
            try:
                self.collection = self.client.get_collection("thi_v01_functions")
            except:
                return {"error": "Collection not found"}
        
        count = self.collection.count()
        
        # Get sample to count functions
        sample = self.collection.get(limit=1000)
        
        function_count = 0
        modified_count = 0
        sources = set()
        
        if sample['metadatas']:
            for meta in sample['metadatas']:
                if meta.get('type') == 'function':
                    function_count += 1
                    if meta.get('is_modified'):
                        modified_count += 1
                if meta.get('source'):
                    sources.add(meta['source'])
        
        return {
            'total_documents': count,
            'total_functions': function_count,
            'modified_functions': modified_count,
            'unique_sources': len(sources),
            'sample_sources': list(sources)[:10] if sources else [],
            'db_path': str(self.db_path.absolute())
        }


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="RAG System for THI-V01 Functions Documentation (Mistral Vibe Exclusive)"
    )
    parser.add_argument(
        '--build',
        action='store_true',
        help='Build/index the RAG database'
    )
    parser.add_argument(
        '--reset',
        action='store_true',
        help='Reset and rebuild the database'
    )
    parser.add_argument(
        '--query',
        type=str,
        default=None,
        help='Query the RAG database'
    )
    parser.add_argument(
        '--stats',
        action='store_true',
        help='Show database statistics'
    )
    parser.add_argument(
        '--n',
        type=int,
        default=5,
        help='Number of results to return (default: 5)'
    )
    
    args = parser.parse_args()
    
    # Initialize RAG
    rag = FunctionsRAG()
    
    if args.reset:
        rag.reset_database()
        rag.build_index(force_reset=False)
    elif args.build:
        rag.build_index(force_reset=False)
    elif args.stats:
        stats = rag.get_stats()
        print("\n" + "=" * 60)
        print("RAG Database Statistics")
        print("=" * 60)
        for key, value in stats.items():
            if isinstance(value, list):
                print(f"{key}:")
                for item in value[:5]:  # Show first 5
                    print(f"  - {item}")
                if len(value) > 5:
                    print(f"  ... and {len(value) - 5} more")
            else:
                print(f"{key}: {value}")
    elif args.query:
        results = rag.query(args.query, n_results=args.n)
        
        print("\n" + "=" * 60)
        print(f"Query: '{args.query}'")
        print("=" * 60)
        
        for i, result in enumerate(results, 1):
            print(f"\nResult {i} (Similarity: {result['similarity']:.3f})")
            print("-" * 60)
            
            # Show metadata
            if result.get('metadata'):
                meta = result['metadata']
                if 'function_id' in meta:
                    modified_tag = " [MODIFIED]" if meta.get('is_modified') else ""
                    print(f"Function: {meta.get('function_id')} - {meta.get('function_desc', 'N/A')}{modified_tag}")
                print(f"Source: {meta.get('source', 'N/A')}")
                if 'title' in meta:
                    print(f"Title: {meta['title']}")
            
            # Show document excerpt
            doc_text = result['document']
            if len(doc_text) > 800:
                doc_text = doc_text[:800] + "..."
            print(f"\nContent:\n{doc_text}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
