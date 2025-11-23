import io
import os
import re
import datetime
import hashlib
import shutil

from flask import Blueprint, render_template, jsonify, send_from_directory, redirect, url_for, request
from flask_login import login_required

from werkzeug.utils import secure_filename

from api.utils import list_all_files_and_directories, get_files_and_directories


NOTES_DIR = os.environ.get('NOTES_DIR', './notas')

api = Blueprint('api', import_name=__name__, url_prefix='/api')

@api.route('/load', methods=['GET'])
@login_required
def load_note():
    if not str(request.args.get('path')).endswith('.md'):
        return 'Ruta no valida', 404

    file_dir=os.path.join(NOTES_DIR, str(request.args.get('path')).lstrip('/'))
    if not file_dir.endswith('.md'):
        return 'Solo se pueden cargar ficheros markdown (.md)', 500
    try:
        if not os.path.exists(os.path.dirname(file_dir)):
            os.makedirs(os.path.dirname(file_dir))
        if not os.path.exists(file_dir):
            with open(file_dir, 'w') as f:
                f.write('')

        with open(file_dir, 'r') as f:
            raw_data = f.read()

        regex_pattern = re.compile(r'<!--\s*(.*?)\s*-->(.*?)<!--\s*end\s*-->', re.DOTALL)

        blocks = []
        for i, (header, content) in enumerate(re.findall(regex_pattern, raw_data)):
            header_values: dict = eval('{' + header + '}')
            blocks.append({
                'content': content.strip(),
                **header_values
            }) 

        return jsonify(blocks)
    except Exception as e:
        print(e)
        return 'Error al cargar el fichero', 500
    
@api.route('/save', methods=['POST'])
@login_required
def save_note():
    file_dir=os.path.join(NOTES_DIR, str(request.args.get('path')).lstrip('/'))
    try:
        contenido = request.get_json()
        if contenido is None:
            return "No se ha recibido nada", 400
        rendered_markdown = render_template('api/remake-markdown.md', bloques=contenido)
        with open(file_dir, 'w') as f:
            f.write(rendered_markdown)

        return 'Se ha guardado el fichero', 200
    except Exception as e:
        print(e)
        return 'Error al guardar el fichero', 500
    

@api.route('/trash', methods=['POST'])
@login_required
def delete_note():
    file_dir=os.path.join(NOTES_DIR, str(request.args.get('path')).lstrip('/'))

    try:
        if not os.path.exists(os.path.join(NOTES_DIR, 'papelera')):
            os.makedirs(os.path.join(NOTES_DIR, 'papelera'))

        fichero = os.path.join(NOTES_DIR, 'papelera', f"{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}_{os.path.basename(file_dir)}")
        shutil.move(file_dir, fichero)

        return 'Se ha eliminado el fichero', 200
    except Exception as e:
        print(e)
        return 'Error al eliminar el fichero', 500

@api.route('/create', methods=['POST'])
@login_required
def create():
    new_file_or_dir=os.path.join(NOTES_DIR, str(request.args.get('path')).lstrip('/'))
    if not os.path.isdir(new_file_or_dir):
        new_file_or_dir = os.path.dirname(new_file_or_dir)
    new_file_or_dir = os.path.join(new_file_or_dir, str(request.args.get('name')).lstrip('/'))

    try:
        if len(os.path.basename(new_file_or_dir).split('.'))==1:
            # directory
            if not os.path.exists(new_file_or_dir):
                os.makedirs(new_file_or_dir)
            return 'Se ha creado el directorio', 200
        elif os.path.basename(new_file_or_dir).endswith('.md'):
            if not os.path.exists(os.path.dirname(new_file_or_dir)):
                os.makedirs(os.path.dirname(new_file_or_dir))
            with open(new_file_or_dir, 'w') as f:
                f.write('')
            return 'Se ha creado el fichero', 200
        return 'Solo se pueden crear directorios y ficheros .md', 500
    except Exception as e:
        print(e)
        return 'Error al eliminar el fichero', 500

@api.route('/tree', methods=['GET'])
@login_required
def load_dirtree_main():
    req_path = str(request.args.get('path')).lstrip('/')
    path = os.path.join(NOTES_DIR, req_path)

    if not os.path.isdir(path):
        path = os.path.dirname(path)

    try:
        dirtree = get_files_and_directories(os.path.abspath(path), os.path.abspath(path))
        return jsonify(dirtree)
    except Exception as e:
        print(e)
        return 'Error al cargar el directorio', 500
    
@api.route('/hint', methods=['GET'])
@login_required
def load_possible_endpoints():
    req_path = str(request.args.get('path')).lstrip('/')
    path = os.path.join(NOTES_DIR, req_path)

    if not os.path.isdir(path):
        path = os.path.dirname(path)

    try:
        files = list_all_files_and_directories(os.path.abspath(path))

        return jsonify(files)
    except Exception as e:
        print(e)
        return 'Error al cargar las hints', 500

@api.route('/templates', methods=['GET'])
@login_required
def load_nunjucks_teplate():
    path = str(request.args.get('path')).lstrip('/')
    if os.path.exists(f'api/nunjucks-templates/{path}'):
        try:
            with open(f'api/nunjucks-templates/{path}', 'r') as f:
                text_content = f.read()
            return text_content, 200
        except Exception as e:
            print(e)
            return 'Error al cargar template', 500
    else:
        return 'No existe la plantilla', 500

@api.route('/image', methods=['POST'])
@login_required
def cargar_imagen():
    slug_dir = os.path.join(NOTES_DIR, str(request.args.get('path')).lstrip('/'))
    if not os.path.isdir(slug_dir):
        slug_dir = os.path.dirname(slug_dir)

    slug_dir = os.path.join(slug_dir, 'images')
    if not os.path.exists(slug_dir):
        os.mkdir(slug_dir)
    slug_dir = os.path.abspath(slug_dir)

    if 'image' not in request.files:
        return jsonify({'error': 'No se encontró el archivo de imagen'}), 400
    
    file = request.files['image']
    
    if file.filename == '':
        return jsonify({'error': 'Nombre de archivo no válido'}), 400

    if file:
        output = io.BytesIO()
        file.save(output)
        filename = (
            hashlib.sha1(output.getbuffer()).hexdigest()[:8] +
            f"_{datetime.date.today().strftime('%Y%m%d')}_" +
            secure_filename(str(file.filename))
        )
        filepath = os.path.join(slug_dir, filename)
        print(filepath)
        
        with open(filepath, 'wb') as f:
            f.write(output.getbuffer())
        
        image_url = filepath.replace(os.path.abspath(NOTES_DIR), '')
        
        return jsonify({'url': image_url}), 200

    return jsonify({'error': 'Error desconocido al subir el archivo'}), 500

@api.route('/search', methods=['POST'])
@login_required
def search():
    slug_dir = os.path.join(NOTES_DIR, str(request.args.get('path')).lstrip('/'))
    if not os.path.isdir(slug_dir):
        slug_dir = os.path.dirname(slug_dir)

    search_query = request.get_json().get('query', '')
    try:
        todos_markdown = list(filter(
            lambda x: x.endswith('.md'),
            list_all_files_and_directories(os.path.abspath(slug_dir))
        ))
        
        blocks = []
        for file_dir in todos_markdown:
            with open(os.path.join(NOTES_DIR, file_dir.lstrip('/')), 'r') as f:
                raw_data = f.read()

            regex_pattern = re.compile(r'<!--\s*(.*?)\s*-->(.*?)<!--\s*end\s*-->', re.DOTALL)

            for header, content in re.findall(regex_pattern, raw_data):
                header_values: dict = eval('{' + header + '}')
                blocks.append({
                    'content': content.strip(),
                    'link': file_dir,
                    **header_values
                })

        query_result = list(filter(
            lambda x: search_query.lower() in x['content'].lower() or search_query.lower() in x['link'].lower(),
            blocks
        ))

        bloques_a_devolver = sorted(query_result, key=lambda x: datetime.datetime.strptime(x['modified'], '%Y-%m-%d %H:%M:%S'), reverse=True)

        return jsonify(bloques_a_devolver)
    except Exception as e:
        print(e)
        return 'Error al cargar los bloques', 500
