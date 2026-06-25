#!/usr/bin/env python3
"""
Complete Project RAG System for THI-V01
======================================

This script creates a comprehensive RAG system for the ENTIRE project,
indexing all relevant files (code, docs, configs, etc.) with smart categorization.

The vector database is stored at the project root as 'project_rag_db/'
and is designed to be used exclusively by Mistral Vibe.

Usage:
    python project_rag.py --build          # Build/index the complete RAG
    python project_rag.py --query "search"  # Query the RAG
    python project_rag.py --stats          # Show statistics
    python project_rag.py --reset          # Reset and rebuild
    python project_rag.py --list-categories # List all categories
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import chromadb
from chromadb.utils import embedding_functions

# Configuration
PROJECT_RAG_DB_PATH = "project_rag_db"  # At project root
CHUNK_SIZE = 2000  # Larger chunks for code files
CHUNK_OVERLAP = 400
MIN_CHUNK_SIZE = 200
MAX_FILE_SIZE = 100000  # Skip files larger than 100KB (configurable)

# File type categories and their extensions
FILE_CATEGORIES = {
    'documentation': ['.md', '.txt', '.rst'],
    'configuration': ['.json', '.yaml', '.yml', '.toml', '.ini', '.env'],
    'javascript': ['.js', '.jsx', '.ts', '.tsx'],
    'python': ['.py'],
    'html': ['.html', '.htm'],
    'css': ['.css', '.scss', '.sass', '.less'],
    'sql': ['.sql'],
    'shell': ['.sh', '.bash'],
    'other': []  # Catch-all for other text files
}

# Files/directories to exclude
EXCLUDE_DIRS = ['.git', 'node_modules', 'functions_rag_db', 'project_rag_db', '__pycache__']
EXCLUDE_FILES = ['.DS_Store', 'Thumbs.db', '*.log']


class ProjectRAG:
    """Comprehensive RAG system for the entire THI-V01 project."""
    
    def __init__(self, db_path: str = PROJECT_RAG_DB_PATH):
        """Initialize the RAG system."""
        self.db_path = Path(db_path)
        self.client = None
        self.collection = None
        self.embedding_function = None
        
    def _get_embedding_function(self):
        """Get or create the embedding function."""
        if self.embedding_function is None:
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
    
    def _get_file_category(self, filepath: Path) -> str:
        """Determine the category of a file based on its extension."""
        ext = filepath.suffix.lower()
        for category, extensions in FILE_CATEGORIES.items():
            if ext in extensions:
                return category
        return 'other'
    
    def _should_exclude(self, path: Path) -> bool:
        """Check if a file or directory should be excluded."""
        # Check excluded directories
        for excluded in EXCLUDE_DIRS:
            if excluded in str(path):
                return True
        
        # Check excluded files
        if path.name in EXCLUDE_FILES:
            return True
        
        # Check file size
        if path.is_file() and path.stat().st_size > MAX_FILE_SIZE:
            return True
        
        return False
    
    def _extract_file_metadata(self, filepath: Path) -> Dict[str, Any]:
        """Extract metadata from a file."""
        relative_path = str(filepath.relative_to(Path('.')))
        
        # Get file stats
        stat = filepath.stat()
        
        # Determine category
        category = self._get_file_category(filepath)
        
        # Extract project structure info
        parts = relative_path.split('/')
        depth = len(parts)
        
        # Try to extract title/content preview for text files
        title = filepath.name
        preview = ""
        
        try:
            if category in ['documentation', 'configuration', 'javascript', 'python', 'html', 'css', 'sql', 'shell']:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read(500)  # Read first 500 chars for preview
                    preview = content.replace('\n', ' ').strip()[:200]
                    
                    # Try to extract title from markdown
                    if category == 'documentation' and content.startswith('# '):
                        title = content.split('\n')[0][2:].strip()[:100]
        except Exception:
            pass
        
        return {
            'path': relative_path,
            'filename': filepath.name,
            'category': category,
            'size': stat.st_size,
            'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
            'title': title,
            'preview': preview,
            'depth': depth,
            'extension': filepath.suffix.lower()
        }
    
    def _get_file_content(self, filepath: Path) -> str:
        """Get the content of a file, handling different encodings."""
        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                return f.read()
        except UnicodeDecodeError:
            try:
                with open(filepath, 'r', encoding='latin-1', errors='replace') as f:
                    return f.read()
            except Exception:
                return ""
        except Exception:
            return ""
    
    def _chunk_text(self, text: str, metadata: Dict[str, Any], max_chunk_size: int = CHUNK_SIZE) -> List[Dict[str, Any]]:
        """Split text into chunks with metadata."""
        chunks = []
        
        # For code files, try to split by logical blocks
        if metadata.get('category') in ['javascript', 'python', 'html', 'css', 'sql']:
            # Split by double newline, then group into chunks
            paragraphs = [p for p in text.split('\n\n') if p.strip()]
            
            current_chunk = ""
            current_index = 0
            
            for para in paragraphs:
                if len(current_chunk) + len(para) + 2 > max_chunk_size:
                    if current_chunk:
                        chunks.append({
                            'text': current_chunk,
                            'metadata': {
                                **metadata,
                                'chunk_index': current_index,
                                'chunk_type': 'code_block'
                            }
                        })
                        current_index += 1
                    current_chunk = para
                else:
                    current_chunk += ("\n\n" if current_chunk else "") + para
            
            if current_chunk:
                chunks.append({
                    'text': current_chunk,
                    'metadata': {
                        **metadata,
                        'chunk_index': current_index,
                        'chunk_type': 'code_block'
                    }
                })
        else:
            # For documentation, split by sections
            chunks = self._chunk_by_sections(text, metadata)
        
        return chunks if chunks else [{
            'text': text,
            'metadata': {
                **metadata,
                'chunk_index': 0,
                'chunk_type': 'full_document'
            }
        }]
    
    def _chunk_by_sections(self, text: str, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Split documentation by sections (headings)."""
        import re
        
        chunks = []
        lines = text.split('\n')
        
        current_section = []
        current_heading = None
        current_level = 0
        
        for line in lines:
            # Check for markdown headings
            heading_match = re.match(r'^(#{1,6})\s+(.+?)$', line)
            
            if heading_match:
                # Save previous section if exists
                if current_section:
                    section_text = '\n'.join(current_section)
                    if len(section_text) >= MIN_CHUNK_SIZE:
                        chunks.append({
                            'text': section_text,
                            'metadata': {
                                **metadata,
                                'chunk_index': len(chunks),
                                'chunk_type': 'section',
                                'heading': current_heading,
                                'heading_level': current_level
                            }
                        })
                    elif len(section_text) > 0:
                        # Merge with previous chunk if too small
                        if chunks:
                            chunks[-1]['text'] += '\n\n' + section_text
                
                # Start new section
                current_heading = heading_match.group(2)
                current_level = len(heading_match.group(1))
                current_section = [line]
            elif current_section:
                current_section.append(line)
        
        # Add the last section
        if current_section:
            section_text = '\n'.join(current_section)
            chunks.append({
                'text': section_text,
                'metadata': {
                    **metadata,
                    'chunk_index': len(chunks),
                    'chunk_type': 'section',
                    'heading': current_heading,
                    'heading_level': current_level
                }
            })
        
        return chunks
    
    def _scan_project(self) -> List[Path]:
        """Scan the entire project for indexable files."""
        project_root = Path('.')
        indexable_files = []
        
        print("Scanning project structure...")
        
        for root, dirs, files in os.walk(project_root):
            root_path = Path(root)
            
            # Remove excluded directories from the search
            dirs[:] = [d for d in dirs if not self._should_exclude(root_path / d)]
            
            for file in files:
                file_path = root_path / file
                
                if not self._should_exclude(file_path):
                    # Check if it's a text-based file we can index
                    try:
                        # Try to read as text
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            f.read(100)  # Test read
                        indexable_files.append(file_path)
                    except Exception:
                        pass
        
        print(f"Found {len(indexable_files)} indexable files")
        return indexable_files
    
    def build_index(self, force_reset: bool = False, categories: Optional[List[str]] = None):
        """Build the RAG index from all project files."""
        print("=" * 70)
        print("Building Complete Project RAG Index for THI-V01")
        print("=" * 70)
        
        if force_reset:
            self.reset_database()
        
        # Scan project
        files = self._scan_project()
        
        # Filter by categories if specified
        if categories:
            files = [f for f in files if self._get_file_category(f) in categories]
            print(f"Filtering to categories: {', '.join(categories)}")
        
        # Initialize ChromaDB
        client = self._get_client()
        embedding_func = self._get_embedding_function()
        
        # Create or get collection
        collection_name = "thi_v01_complete_project"
        try:
            self.collection = client.get_collection(collection_name)
            print(f"Using existing collection: {collection_name}")
        except:
            self.collection = client.create_collection(
                name=collection_name,
                embedding_function=embedding_func,
                metadata={
                    "description": "Complete THI-V01 Project RAG",
                    "project": "THI-V01",
                    "vibe_exclusive": True,
                    "created": datetime.now().isoformat()
                }
            )
            print(f"Created new collection: {collection_name}")
        
        # Process files
        stats = {
            'total_files': 0,
            'total_chunks': 0,
            'by_category': {},
            'by_extension': {},
            'skipped': 0
        }
        
        all_ids = []
        all_documents = []
        all_metadatas = []
        
        for filepath in files:
            try:
                category = self._get_file_category(filepath)
                
                # Extract metadata
                metadata = self._extract_file_metadata(filepath)
                
                # Get content
                content = self._get_file_content(filepath)
                
                if not content or len(content) < 10:
                    stats['skipped'] += 1
                    continue
                
                # Chunk the content
                chunks = self._chunk_text(content, metadata)
                
                if not chunks:
                    stats['skipped'] += 1
                    continue
                
                # Add to stats
                stats['total_files'] += 1
                stats['total_chunks'] += len(chunks)
                stats['by_category'][category] = stats['by_category'].get(category, 0) + 1
                stats['by_extension'][metadata['extension']] = stats['by_extension'].get(metadata['extension'], 0) + 1
                
                # Add chunks to collection
                for i, chunk in enumerate(chunks):
                    chunk_id = f"{metadata['path']}_chunk_{i}"
                    
                    all_ids.append(chunk_id)
                    all_documents.append(chunk['text'])
                    all_metadatas.append(chunk['metadata'])
                
                print(f"  ✓ {metadata['path']} ({category}, {len(content)} chars, {len(chunks)} chunks)")
                
            except Exception as e:
                print(f"  ✗ {filepath}: {e}")
                stats['skipped'] += 1
        
        # Add in batches
        batch_size = 100
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
        
        print(f"\n✓ Indexing complete!")
        print(f"  - Total files indexed: {stats['total_files']}")
        print(f"  - Total chunks: {stats['total_chunks']}")
        print(f"  - Files skipped: {stats['skipped']}")
        print(f"  - Database location: {self.db_path.absolute()}")
        
        print(f"\nBy Category:")
        for cat, count in sorted(stats['by_category'].items(), key=lambda x: x[1], reverse=True):
            print(f"  - {cat}: {count} files")
        
        return stats
    
    def query(self, query: str, n_results: int = 5, 
              category: Optional[str] = None,
              file_path: Optional[str] = None) -> List[Dict[str, Any]]:
        """Query the RAG database with optional filters."""
        if self.collection is None:
            self._get_client()
            try:
                self.collection = self.client.get_collection("thi_v01_complete_project")
            except:
                raise Exception("Collection not found. Please build the index first with: python project_rag.py --build")
        
        # Build query filters
        where = {}
        if category:
            where['category'] = category
        if file_path:
            where['path'] = file_path
        
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where if where else None
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
            
            # Add similarity score
            result['similarity'] = 1 - result['distance']
            
            formatted_results.append(result)
        
        return formatted_results
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the RAG database."""
        if self.collection is None:
            self._get_client()
            try:
                self.collection = self.client.get_collection("thi_v01_complete_project")
            except:
                return {"error": "Collection not found"}
        
        count = self.collection.count()
        
        # Get sample to analyze
        sample = self.collection.get(limit=1000)
        
        stats = {
            'total_documents': count,
            'categories': {},
            'extensions': {},
            'sources': set()
        }
        
        if sample['metadatas']:
            for meta in sample['metadatas']:
                if meta.get('category'):
                    stats['categories'][meta['category']] = stats['categories'].get(meta['category'], 0) + 1
                if meta.get('extension'):
                    stats['extensions'][meta['extension']] = stats['extensions'].get(meta['extension'], 0) + 1
                if meta.get('path'):
                    stats['sources'].add(meta['path'])
        
        return {
            **stats,
            'unique_sources': len(stats['sources']),
            'db_path': str(self.db_path.absolute())
        }
    
    def list_categories(self) -> Dict[str, Any]:
        """List all available categories and their counts."""
        if self.collection is None:
            self._get_client()
            try:
                self.collection = self.client.get_collection("thi_v01_complete_project")
            except:
                return {"error": "Collection not found"}
        
        # Get all unique categories
        results = self.collection.get(limit=10000)
        
        categories = {}
        for meta in results['metadatas']:
            cat = meta.get('category', 'unknown')
            categories[cat] = categories.get(cat, 0) + 1
        
        return categories


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Complete Project RAG System for THI-V01 (Mistral Vibe Exclusive)"
    )
    parser.add_argument(
        '--build',
        action='store_true',
        help='Build/index the complete RAG database'
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
        '--category',
        type=str,
        default=None,
        help='Filter query by category (documentation, configuration, javascript, etc.)'
    )
    parser.add_argument(
        '--file',
        type=str,
        default=None,
        help='Filter query by file path'
    )
    parser.add_argument(
        '--stats',
        action='store_true',
        help='Show database statistics'
    )
    parser.add_argument(
        '--list-categories',
        action='store_true',
        help='List all available categories'
    )
    parser.add_argument(
        '--n',
        type=int,
        default=5,
        help='Number of results to return (default: 5)'
    )
    
    args = parser.parse_args()
    
    # Initialize RAG
    rag = ProjectRAG()
    
    if args.reset:
        rag.reset_database()
        rag.build_index(force_reset=False)
    elif args.build:
        rag.build_index(force_reset=False)
    elif args.list_categories:
        categories = rag.list_categories()
        print("\n" + "=" * 60)
        print("Available Categories")
        print("=" * 60)
        for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
            print(f"- {cat}: {count} documents")
    elif args.stats:
        stats = rag.get_stats()
        print("\n" + "=" * 60)
        print("Project RAG Database Statistics")
        print("=" * 60)
        for key, value in stats.items():
            if isinstance(value, dict):
                print(f"\n{key}:")
                for k, v in sorted(value.items(), key=lambda x: x[1], reverse=True):
                    print(f"  - {k}: {v}")
            else:
                print(f"{key}: {value}")
    elif args.query:
        results = rag.query(
            args.query,
            n_results=args.n,
            category=args.category,
            file_path=args.file
        )
        
        print("\n" + "=" * 70)
        print(f"Query: '{args.query}'")
        if args.category:
            print(f"Category: {args.category}")
        if args.file:
            print(f"File: {args.file}")
        print("=" * 70)
        
        for i, result in enumerate(results, 1):
            print(f"\nResult {i} (Similarity: {result['similarity']:.3f})")
            print("-" * 70)
            
            meta = result.get('metadata', {})
            
            # Display metadata
            print(f"📁 Path: {meta.get('path', 'N/A')}")
            print(f"🏷️  Category: {meta.get('category', 'N/A')}")
            if meta.get('title'):
                print(f"📝 Title: {meta.get('title')}")
            if meta.get('heading'):
                print(f"🎯 Section: {meta.get('heading')}")
            print(f"📊 Size: {meta.get('size', 0):,} bytes")
            
            # Display document excerpt
            doc_text = result['document']
            if len(doc_text) > 1000:
                doc_text = doc_text[:1000] + "..."
            print(f"\n📄 Content Preview:\n{doc_text}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
