import io
import os
import re
import datetime
import hashlib

from flask import Flask, render_template, jsonify, send_from_directory, redirect, url_for, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, logout_user, login_required, current_user, UserMixin

from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash


notas_app = Flask(__name__)
notas_app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///db.sqlite"
notas_app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
notas_app.config["SECRET_KEY"] = os.environ.get('SECRET_KEY', 'secret_key')

db = SQLAlchemy(notas_app)
login_manager = LoginManager()
login_manager.init_app(notas_app)
login_manager.login_view = "login"

NOTES_DIR = os.environ.get('NOTES_DIR', './notas')
USERNAME = os.environ.get('USERNAME', 'admin')
# password hash generated with generate_password_hash, this example is with "admin"
PASSWORD = os.environ.get('PASSWORD', 'admin')

class Users(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(250), unique=True, nullable=False)
    password = db.Column(db.String(250), nullable=False)

with notas_app.app_context():
    if not os.path.exists("db.sqlite"):
        db.create_all()

    if not Users.query.filter_by(username=USERNAME).first():
        hashed_password = generate_password_hash(PASSWORD, method="pbkdf2:sha256")
        new_user = Users(username=USERNAME, password=hashed_password)
        db.session.add(new_user)
        db.session.commit()

@login_manager.user_loader
def load_user(user_id):
    return Users.query.get(int(user_id))

@notas_app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        user = Users.query.filter_by(username=username).first()

        if user and check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for("main_page"))
        else:
            return render_template("login.html", error="Invalid username or password")

    return render_template("login.html")

@notas_app.route('/', methods=['GET'])
@login_required
def main_page():
    return render_template('index.html')

@notas_app.route('/images', methods=['GET'])
@login_required
def view_images():
    images_list = list_all_files_and_directories(os.path.join(os.path.abspath(NOTES_DIR), 'images'))
    images_list = list(filter(lambda x: x.endswith('.png') or x.endswith('.jpg'), images_list))
    return render_template('images.html', images = images_list)

@notas_app.route('/<path:slug>', methods=['GET'])
@login_required
def view_note(slug):
    if slug.endswith('.png') or slug.endswith('.jpg'):
        return send_from_directory(directory=os.path.dirname(os.path.join(NOTES_DIR, slug)), path=os.path.basename(slug))
    elif slug.endswith('images'):
        images_list = list_all_files_and_directories(os.path.join(os.path.abspath(NOTES_DIR), slug))
        images_list = list(filter(lambda x: x.endswith('.png') or x.endswith('.jpg'), images_list))
        return render_template('images.html', images = images_list)

    return render_template('index.html')

@notas_app.route('/load/<path:slug>', methods=['GET'])
@login_required
def load_note(slug):

    file_dir=os.path.join(NOTES_DIR, slug)
    if not file_dir.endswith('.md'):
        return 'Solo se pueden crear ficheros markdown (.md)', 500
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
                'index': i+1,
                'type': header_values.get('type', None),
                'created': header_values.get('created', None),
                'modified': header_values.get('modified', None),
                'content': content.strip(),
            }) 

        return jsonify(blocks)
    except:
        return 'Error al cargar el fichero', 500
    
@notas_app.route('/save/<path:slug>', methods=['POST'])
@login_required
def save_note(slug):
    file_dir=os.path.join(NOTES_DIR, slug)
    try:
        contenido = request.get_json()
        if contenido is None:
            return "No se ha recibido nada", 400
        rendered_markdown = render_template('remake-markdown.md', bloques=contenido)

        with open(file_dir, 'w') as f:
            f.write(rendered_markdown)

        return 'Se ha guardado el fichero', 200
    except Exception as e:
        return 'Error al guardar el fichero', 500
    

def get_files_and_directories(path):
    result = []

    for f in os.listdir(path):
        cur_path = os.path.join(path, f)
        path_url = cur_path.replace(os.path.abspath(NOTES_DIR), '')
        if os.path.isdir(cur_path):
            subdir = get_files_and_directories(cur_path)
        else:
            subdir = None

        result.append({
            'path': path_url,
            'display': f,
            'subdir': subdir
        })

    return sorted(result, key=lambda x: x['display'] if x['subdir'] is None else '_' + x['display'])

def list_all_files_and_directories(start_path):
    all_items = []
    for root, dirs, files in os.walk(start_path):
        all_items.append(root.replace(os.path.abspath(NOTES_DIR), '')) 
            
        for file in files:
            full_path = os.path.join(root, file).replace(os.path.abspath(NOTES_DIR), '')
            all_items.append(full_path)
            
    return sorted([item if len(item)>0 else '/' for item in all_items])


@notas_app.route('/load-everything', methods=['GET'])
@login_required
def load_everything():
    try:
        todos_markdown = list(filter(
            lambda x: x.endswith('.md'),
            list_all_files_and_directories(os.path.abspath(NOTES_DIR))
        ))
        
        blocks = []
        for file_dir in todos_markdown:
            with open(os.path.join(NOTES_DIR, file_dir[1:]), 'r') as f:
                raw_data = f.read()

            regex_pattern = re.compile(r'<!--\s*(.*?)\s*-->(.*?)<!--\s*end\s*-->', re.DOTALL)

            for header, content in re.findall(regex_pattern, raw_data):
                header_values: dict = eval('{' + header + '}')
                blocks.append({
                    'created': header_values.get('created', None),
                    'modified': header_values.get('modified', None),
                    'content': content.strip(),
                    'link': file_dir
                })

        bloques_a_devolver = sorted(blocks, key=lambda x: datetime.datetime.strptime(x['modified'], '%Y-%m-%d %H:%M:%S'), reverse=True)

        return jsonify(bloques_a_devolver)
    except Exception as e:
        return 'Error al cargar los bloques', 500

@notas_app.route('/load-dirtree/', methods=['GET'])
@login_required
def load_dirtree_main():
    try:
        dirtree = get_files_and_directories(os.path.abspath(NOTES_DIR))

        return jsonify(dirtree)
    except Exception as e:
        print(e)
        return 'Error al cargar el fichero', 500
    
@notas_app.route('/load-hint', methods=['GET'])
@login_required
def load_possible_endpoints():
    try:
        files = list_all_files_and_directories(os.path.abspath(NOTES_DIR))

        return jsonify(files)
    except Exception as e:
        print(e)
        return 'Error al cargar las hints', 500

@notas_app.route('/load-dirtree/<path:slug>', methods=['GET'])
@login_required
def load_dirtree(slug):
    slug_dir = os.path.join(NOTES_DIR, slug)
    if not os.path.isdir(slug_dir):
        slug_dir = os.path.dirname(slug_dir)
    try:
        dirtree = get_files_and_directories(os.path.abspath(slug_dir))

        return jsonify(dirtree)
    except Exception as e:
        print(e)
        return 'Error al cargar el fichero', 500

@notas_app.route('/upload-image/<path:slug>', methods=['POST'])
@login_required
def cargar_imagen(slug):
    slug_dir = os.path.join(NOTES_DIR, slug)
    if not os.path.isdir(slug_dir):
        slug_dir = os.path.join(os.path.dirname(slug_dir), 'images')
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
        filename = hashlib.sha1(output.getbuffer()).hexdigest()[:8] + f"_{datetime.date.today().strftime('%Y%m%d')}_" + secure_filename(file.filename)
        filepath = os.path.join(slug_dir, filename)
        
        with open(filepath, 'wb') as f:
            f.write(output.getbuffer())
        
        image_url = filepath.replace(slug_dir, './images')
        
        return jsonify({'url': image_url}), 200

    return jsonify({'error': 'Error desconocido al subir el archivo'}), 500


@notas_app.route('/nunjucks-templates/<slug>', methods=['GET'])
@login_required
def load_nunjucks_teplate(slug):
    if os.path.exists(f'./nunjucks-templates/{slug}'):
        try:
            with open(f'./nunjucks-templates/{slug}', 'r') as f:
                text_content = f.read()
            return text_content, 200
        except Exception as e:
            print(e)
            return 'Error al cargar template', 500
    else:
        return 'No existe la plantilla', 500 

@notas_app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("main_page"))

if __name__ == '__main__':
    notas_app.run(debug=True, port=8585)