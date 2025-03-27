"""
CV Analyzer API

This Flask application provides an API for analyzing CVs.
It receives CV files, processes them using the analyzer module, and returns the analysis results.
"""

import os
import tempfile
import logging
from typing import Dict, Any, Optional
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import requests
from dotenv import load_dotenv

# Import the analyzer module
from analyzer import analyze_cv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure upload settings
UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', tempfile.gettempdir())
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'doc', 'txt', 'rtf', 'jpg', 'jpeg', 'png'}
MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH', 20 * 1024 * 1024))  # 20MB default

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH


def allowed_file(filename: str) -> bool:
    """
    Check if the file has an allowed extension.
    
    Args:
        filename: Name of the file
        
    Returns:
        bool: True if file extension is allowed, False otherwise
    """
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def download_file(url: str) -> Optional[str]:
    """
    Download a file from a URL and save it locally.
    
    Args:
        url: URL of the file to download
        
    Returns:
        Optional[str]: Path to the downloaded file, or None if download failed
    """
    try:
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        
        # Try to get filename from content-disposition header or use the URL's filename
        content_disposition = response.headers.get('content-disposition')
        if content_disposition and 'filename=' in content_disposition:
            filename = content_disposition.split('filename=')[1].strip('"\'')
        else:
            filename = url.split('/')[-1]
            
        filename = secure_filename(filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        with open(file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                
        logger.info(f"File downloaded from {url} to {file_path}")
        return file_path
    except Exception as e:
        logger.error(f"Error downloading file from {url}: {str(e)}")
        return None


@app.route('/health', methods=['GET'])
def health_check() -> Dict[str, Any]:
    """
    Health check endpoint.
    
    Returns:
        Dict[str, Any]: Health status information
    """
    return jsonify({
        'status': 'healthy',
        'service': 'cv-analyzer',
        'version': '1.0.0',
    })


@app.route('/analyze', methods=['POST'])
def analyze() -> Dict[str, Any]:
    """
    Analyze a CV file.
    
    POST parameters:
    - file: CV file to analyze
    - file_url: URL of the CV file to analyze (alternative to file)
    - extracted_text: Pre-extracted text from the CV (optional)
    
    Returns:
        Dict[str, Any]: Analysis results
    """
    try:
        # Check if a file was uploaded
        if 'file' in request.files:
            file = request.files['file']
            if file.filename == '':
                return jsonify({
                    'success': False,
                    'error': 'No file selected'
                }), 400
                
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)
                logger.info(f"File uploaded: {file_path}")
            else:
                return jsonify({
                    'success': False,
                    'error': f'File type not allowed. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'
                }), 400
        # Check if a file URL was provided
        elif 'file_url' in request.form:
            file_url = request.form['file_url']
            file_path = download_file(file_url)
            if not file_path:
                return jsonify({
                    'success': False,
                    'error': 'Failed to download file from URL'
                }), 400
        else:
            return jsonify({
                'success': False,
                'error': 'No file or file URL provided'
            }), 400
            
        # Get pre-extracted text if provided
        extracted_text = request.form.get('extracted_text')
        
        # Analyze the CV
        result = analyze_cv(file_path, extracted_text)
        
        # Clean up the temporary file
        try:
            os.remove(file_path)
            logger.info(f"Temporary file removed: {file_path}")
        except Exception as e:
            logger.warning(f"Error removing temporary file {file_path}: {str(e)}")
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in analyze endpoint: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    # Create upload folder if it doesn't exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Get port from environment variable or use default
    port = int(os.environ.get('PORT', 5000))
    
    # Run the app
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_ENV') == 'development')
