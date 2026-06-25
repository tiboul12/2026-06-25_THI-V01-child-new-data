# RAG System for THI-V01 Functions Documentation

## 📚 Overview

This directory contains a **Retrieval-Augmented Generation (RAG)** system specifically designed for the THI-V01 functions documentation. The system indexes all markdown files in `tests/fonctions/` and provides semantic search capabilities.

**Important**: This RAG system is designed to be used exclusively by **Mistral Vibe** for enhanced context understanding when working with the THI-V01 project.

## 🗃️ Database Location

The vector database is stored at the **project root** in the directory:
```
functions_rag_db/
```

This directory contains:
- ChromaDB configuration files
- Vector embeddings of all function documentation
- Metadata for retrieval

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install chromadb sentence-transformers
```

### 2. Build the RAG Index

```bash
python rag_functions.py --build
```

This will:
- Scan all `.md` files in `tests/fonctions/`
- Extract function sections using the pattern: `## \`id\` — description`
- Create vector embeddings using `all-MiniLM-L6-v2` model
- Store everything in `functions_rag_db/`

### 3. Query the RAG

```bash
python rag_functions.py --query "comment créer un projet"
```

Or with more results:
```bash
python rag_functions.py --query "gestion des commentaires" --n 10
```

### 4. Get Statistics

```bash
python rag_functions.py --stats
```

### 5. Reset and Rebuild

```bash
python rag_functions.py --reset
```

## 🔍 How It Works

### Data Processing

1. **Document Loading**: All markdown files from `tests/fonctions/` are loaded
2. **Function Extraction**: The system identifies individual functions using the pattern:
   ```markdown
   ## `2-5-1-1` — Chargement
   ```
3. **Chunking**: Each function section is treated as a separate document
4. **Embedding**: Text is converted to vectors using SentenceTransformer
5. **Indexing**: Vectors are stored in ChromaDB with metadata

### Metadata Structure

Each indexed document includes:
- `source`: Relative path to the markdown file
- `title`: Document title (from first H1)
- `function_id`: Function identifier (e.g., `2-5-1-1`)
- `function_desc`: Function description
- `type`: Document type (e.g., "function")

### Query Processing

When you query the RAG:
1. Your query is converted to a vector
2. The system finds the most similar documents
3. Results are returned with similarity scores
4. Full metadata is included for context

## 📊 Statistics

- **Total Functions**: 247 functions
- **Total Files**: 28 markdown files
- **Total Modified Functions**: 14 (marked with `[modification]`)
- **Database Size**: ~10-20 MB (depending on chunking)

## 🎯 Use Cases for Mistral Vibe

This RAG system enables Mistral Vibe to:

1. **Understand Function Context**: When you ask about a specific function, Vibe can retrieve the exact documentation
2. **Cross-Reference Functions**: Find related functions across different files
3. **Answer Technical Questions**: Provide accurate answers based on the actual documentation
4. **Identify Modified Functions**: Quickly locate functions that need retesting

### Example Vibe Prompts

```
"What does function 2-5-1-3 do?"
"Show me all functions related to project creation"
"Which functions are marked as modified?"
"How does the comment system work in the editor?"
"Find functions related to deployment management"
```

## 🛠️ Customization

### Change Embedding Model

Edit `rag_functions.py` and change:
```python
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # Lightweight, good for CPU
# EMBEDDING_MODEL = "all-mpnet-base-v2"  # More accurate, larger
```

### Adjust Chunking Parameters

```python
CHUNK_SIZE = 1000  # Maximum characters per chunk
CHUNK_OVERLAP = 200  # Overlap between chunks
MIN_CHUNK_SIZE = 100  # Minimum characters for a chunk
```

### Custom Metadata

You can extend the metadata extraction in `_extract_function_sections()` to include:
- Priority levels
- Tags
- Component information
- Test status

## 📁 File Structure

```
project_root/
├── functions_rag_db/          # Vector database (created by --build)
│   ├── chroma-collections.parquet
│   ├── chroma-embeddings.parquet
│   └── ...
├── rag_functions.py          # Main RAG script
├── RAG_README.md             # This file
└── tests/
    └── fonctions/             # Source documentation
        ├── connecte/
        │   └── projets/
        │       └── editor/
        │           ├── zone-code/
        │           │   └── fonctions.md
        │           └── ...
        └── non-connecte/
            └── landing/
                └── fonctions.md
```

## 🔒 Access Control

This RAG system is designed for **Mistral Vibe only**. The database contains:
- Internal function documentation
- Technical implementation details
- Project-specific information

**Do not expose** the `functions_rag_db/` directory publicly or share it outside the project team.

## 📝 Maintenance

### Update the Index

Whenever you add or modify function documentation:

```bash
python rag_functions.py --reset
```

This will:
1. Delete the old database
2. Re-index all documents
3. Create a fresh database

### Backup the Database

The `functions_rag_db/` directory can be backed up like any other file:

```bash
# Create backup
tar -czvf functions_rag_db_backup.tar.gz functions_rag_db/

# Restore backup
tar -xzvf functions_rag_db_backup.tar.gz
```

### Monitor Database Size

```bash
du -sh functions_rag_db/
```

## ❓ Troubleshooting

### "Collection not found" Error

Run:
```bash
python rag_functions.py --build
```

### "Module not found" Error

Install dependencies:
```bash
pip install chromadb sentence-transformers
```

### Slow Performance

- Use a smaller embedding model
- Reduce `CHUNK_SIZE`
- Ensure you have enough RAM (2GB+ recommended)

### Out of Memory

Try:
```python
# In rag_functions.py, change to:
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # Smaller model
CHUNK_SIZE = 500  # Smaller chunks
```

## 📞 Support

For issues with the RAG system:
1. Check this README
2. Verify dependencies are installed
3. Try `--reset` to rebuild
4. Check disk space

## 🎉 Features

- ✅ Automatic function extraction from markdown
- ✅ Semantic search with vector embeddings
- ✅ Metadata preservation
- ✅ Batch processing for large datasets
- ✅ Lightweight and portable
- ✅ No external API dependencies
- ✅ Works offline

---

**Last Updated**: 2026-06-25
**Designed for**: Mistral Vibe
**Project**: THI-V01
