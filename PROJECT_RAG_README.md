# Complete Project RAG System for THI-V01

## 🚀 Overview

This is a **comprehensive Retrieval-Augmented Generation (RAG)** system that indexes the **entire THI-V01 project**, including:

- ✅ All documentation files (`.md`, `.txt`)
- ✅ All configuration files (`.json`, `.yaml`, `.yml`, etc.)
- ✅ All JavaScript/TypeScript files (`.js`, `.ts`, `.jsx`, `.tsx`)
- ✅ All Python files (`.py`)
- ✅ All HTML/CSS files
- ✅ All SQL files
- ✅ And more...

**Purpose**: Provide Mistral Vibe with complete context understanding of the entire project, enabling accurate answers to any technical or documentation question.

## 🗃️ Database Location

The vector database is stored at the **project root** in the directory:
```
project_rag_db/
```

This is **separate** from `functions_rag_db/` (which only indexes the functions documentation).

## 🎯 Key Features

### 1. **Smart Categorization**
Files are automatically categorized by type:
- `documentation` - Markdown, text files
- `configuration` - JSON, YAML, TOML, etc.
- `javascript` - JS, TS, JSX, TSX files
- `python` - Python files
- `html` - HTML files
- `css` - CSS, SCSS, SASS files
- `sql` - SQL files
- `shell` - Shell scripts
- `other` - Other text files

### 2. **Intelligent Chunking**
- **Documentation**: Split by sections (headings)
- **Code files**: Split by logical blocks
- **Config files**: Preserved as complete documents (usually small)
- **Large files**: Automatically chunked with overlap

### 3. **Rich Metadata**
Each indexed chunk includes:
- File path (relative to project root)
- File category
- File extension
- File size
- Last modified date
- Document title (for markdown)
- Content preview
- Depth in project structure
- Chunk index within file

### 4. **Filtering Capabilities**
Query results can be filtered by:
- **Category**: Only search in specific file types
- **File path**: Only search in specific files
- **Similarity**: Ranked by semantic similarity

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install chromadb
```

*Note: No additional dependencies needed! Uses ChromaDB's built-in embedding model.*

### 2. Build the Complete RAG Index

```bash
python project_rag.py --build
```

This will:
- Scan the entire project (excluding `.git/`, `node_modules/`, etc.)
- Categorize all files
- Extract content and metadata
- Create vector embeddings
- Store in `project_rag_db/`

**Estimated time**: 2-5 minutes depending on project size
**Estimated disk space**: 50-200 MB

### 3. Query the RAG

Basic query:
```bash
python project_rag.py --query "comment fonctionne le système de déploiement"
```

Query with category filter:
```bash
python project_rag.py --query "configuration API" --category configuration
```

Query with file filter:
```bash
python project_rag.py --query "fonction création" --file "tests/fonctions/connecte/projets/accueil/fonctions.md"
```

Query with more results:
```bash
python project_rag.py --query "gestion des projets" --n 10
```

### 4. Get Statistics

```bash
python project_rag.py --stats
```

### 5. List Available Categories

```bash
python project_rag.py --list-categories
```

### 6. Reset and Rebuild

```bash
python project_rag.py --reset
```

## 📊 What's Indexed

### File Types Included

| Category | Extensions | Description |
|----------|------------|-------------|
| documentation | `.md`, `.txt`, `.rst` | Project documentation |
| configuration | `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.env` | Config files |
| javascript | `.js`, `.jsx`, `.ts`, `.tsx` | JavaScript/TypeScript code |
| python | `.py` | Python scripts |
| html | `.html`, `.htm` | HTML files |
| css | `.css`, `.scss`, `.sass`, `.less` | Stylesheets |
| sql | `.sql` | Database queries |
| shell | `.sh`, `.bash` | Shell scripts |

### File Size Limits

- **Maximum file size**: 100 KB (configurable in `project_rag.py`)
- **Minimum chunk size**: 200 characters
- **Chunk size**: 2000 characters (with 400 char overlap)

### Excluded Directories

- `.git/` - Git repository
- `node_modules/` - Node.js dependencies
- `functions_rag_db/` - Functions-only RAG
- `project_rag_db/` - This RAG database
- `__pycache__/` - Python cache

## 🔍 Example Use Cases for Mistral Vibe

### 1. **Find Function Implementation**
```bash
python project_rag.py --query "fonction 2-5-1-3 création projet" --category javascript
```

### 2. **Understand Configuration**
```bash
python project_rag.py --query "configuration base de données" --category configuration
```

### 3. **Search Across All Documentation**
```bash
python project_rag.py --query "comment déployer l'application" --category documentation
```

### 4. **Find Related Code**
```bash
python project_rag.py --query "gestion des utilisateurs" --category python
```

### 5. **Explore Project Structure**
```bash
python project_rag.py --query "structure du projet" --n 20
```

## 📈 Statistics

After building, you'll see statistics like:

```
Total files indexed: 500+
Total chunks: 2000+
Files skipped: 10-20 (binary files, too large, etc.)

By Category:
  - documentation: 100+ files
  - configuration: 50+ files
  - javascript: 200+ files
  - python: 50+ files
  - html: 30+ files
  - css: 20+ files
  - sql: 10+ files
```

## 🛠️ Customization

### Change File Size Limits

Edit `project_rag.py`:
```python
MAX_FILE_SIZE = 100000  # 100 KB - increase for larger files
CHUNK_SIZE = 2000      # Characters per chunk
CHUNK_OVERLAP = 400   # Overlap between chunks
MIN_CHUNK_SIZE = 200  # Minimum characters for a chunk
```

### Add/Remove File Categories

Edit the `FILE_CATEGORIES` dictionary:
```python
FILE_CATEGORIES = {
    'documentation': ['.md', '.txt', '.rst'],
    'configuration': ['.json', '.yaml', '.yml', '.toml', '.ini', '.env'],
    # Add your custom categories here
    'custom': ['.custom_ext'],
}
```

### Exclude Additional Directories

Edit the `EXCLUDE_DIRS` list:
```python
EXCLUDE_DIRS = ['.git', 'node_modules', 'functions_rag_db', 'project_rag_db', '__pycache__', 'dist', 'build']
```

## 📁 File Structure

```
project_root/
├── project_rag_db/              # Complete project RAG database
│   ├── chroma.sqlite3          # Collection metadata
│   └── <uuid>/                 # Vector data
│       ├── data_level0.bin
│       ├── header.bin
│       ├── length.bin
│       └── link_lists.bin
├── project_rag.py              # Main RAG script
├── PROJECT_RAG_README.md       # This file
├── functions_rag_db/           # Functions-only RAG (separate)
├── rag_functions.py            # Functions-only RAG script
└── ...                         # Rest of the project
```

## 🔄 Maintenance

### Update the Index

Whenever you add or modify project files:

```bash
python project_rag.py --reset
```

This will:
1. Delete the old database
2. Re-scan the entire project
3. Re-index all files

### Partial Updates

For large projects, you can index specific categories:

```python
# In a Python script or REPL
from project_rag import ProjectRAG
rag = ProjectRAG()
rag.build_index(categories=['documentation', 'configuration'])
```

### Backup the Database

```bash
# Create backup
tar -czvf project_rag_db_backup.tar.gz project_rag_db/

# Restore backup
tar -xzvf project_rag_db_backup.tar.gz
```

### Monitor Database Size

```bash
du -sh project_rag_db/
```

## ❓ Troubleshooting

### "Collection not found" Error

Run:
```bash
python project_rag.py --build
```

### "Module not found" Error

Install dependencies:
```bash
pip install chromadb
```

### Out of Memory

- Reduce `MAX_FILE_SIZE` to skip large files
- Reduce `CHUNK_SIZE` for smaller chunks
- Process in smaller batches

### Slow Performance

- Use a machine with more RAM (4GB+ recommended)
- Reduce the number of files indexed
- Use category filters to limit scope

## 📞 Support

For issues with the RAG system:
1. Check this README
2. Verify dependencies are installed
3. Try `--reset` to rebuild
4. Check disk space
5. Review the console output for errors

## 🎉 Advanced Features

### Programmatic Usage

```python
from project_rag import ProjectRAG

# Initialize
rag = ProjectRAG()

# Build index
stats = rag.build_index()
print(f"Indexed {stats['total_files']} files")

# Query
results = rag.query("comment configurer l'API", n_results=5)
for result in results:
    print(f"{result['metadata']['path']}: {result['similarity']:.3f}")
    print(result['document'][:200])

# Get statistics
stats = rag.get_stats()
print(f"Total documents: {stats['total_documents']}")

# List categories
categories = rag.list_categories()
print(f"Categories: {list(categories.keys())}")
```

### Filter by Metadata

```python
# Query only Python files
results = rag.query("database connection", category="python")

# Query only from a specific file
results = rag.query("function definition", file_path="server/db.js")
```

## 🔒 Access Control

**This RAG is designed for Mistral Vibe only.**

- ❌ Do NOT expose `project_rag_db/` publicly
- ❌ Do NOT share outside the project team
- ✅ Use for internal project understanding
- ✅ Use for code navigation
- ✅ Use for documentation search

The database contains:
- Internal project documentation
- Source code
- Configuration details
- Technical implementation information

## 📚 Comparison: Functions RAG vs Project RAG

| Feature | Functions RAG | Project RAG |
|---------|--------------|-------------|
| Scope | Only `tests/fonctions/` | Entire project |
| Database | `functions_rag_db/` | `project_rag_db/` |
| File types | Markdown only | All text files |
| Size | ~10-20 MB | ~50-200 MB |
| Build time | ~1 minute | ~2-5 minutes |
| Use case | Function-specific queries | Any project query |

**Recommendation**: Use both! They serve different purposes:
- Use **Functions RAG** for questions about specific functions
- Use **Project RAG** for general project understanding, code search, configuration

## 📝 Changelog

### v1.0.0 (2026-06-25)
- Initial release
- Complete project indexing
- Smart categorization
- Rich metadata extraction
- Filtering capabilities

---

**Last Updated**: 2026-06-25
**Designed for**: Mistral Vibe
**Project**: THI-V01
**Maintainer**: AI Assistant
