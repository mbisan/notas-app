import io
from ntpath import isdir
import os
from pydoc import isdata
import re
import datetime
import hashlib

from flask import Flask, render_template, jsonify, send_from_directory, redirect, url_for, request, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, logout_user, login_required, current_user, UserMixin

from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

from api.api import api


USERNAME = os.environ.get('USERNAME', 'admin')
PASSWORD = os.environ.get('PASSWORD', 'admin')

NOTES_DIR = os.environ.get('NOTES_DIR', './notas')

if not os.path.exists(NOTES_DIR):
    os.makedirs(NOTES_DIR)
    with open(os.path.join(NOTES_DIR, 'test.md'), 'w') as f:
        f.write('''<!-- {"created": "21/11/2025, 23:17:43", "modified": "21/11/2025, 23:17:50", "type": "markdown"} -->
Test
<!-- end -->
''')

notas_app = Flask(__name__)
notas_app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///db.sqlite"
notas_app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
notas_app.config["SECRET_KEY"] = os.environ.get('SECRET_KEY', 'secret_key')

db = SQLAlchemy(notas_app)

class Users(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(250), unique=True, nullable=False)
    password = db.Column(db.String(250), nullable=False)

def setup_user_db():
    if not os.path.exists("db.sqlite"):
        db.create_all()
    if not Users.query.filter_by(username=USERNAME).first():
        hashed_password = generate_password_hash(PASSWORD, method="pbkdf2:sha256")
        new_user = Users(username=USERNAME, password=hashed_password)
        db.session.add(new_user)
        db.session.commit()

login_manager = LoginManager()
login_manager.init_app(notas_app)
login_manager.login_view = "login"

with notas_app.app_context():
    setup_user_db()


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(Users, ident=user_id)

@notas_app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        user = Users.query.filter_by(username=username).first()

        if user and check_password_hash(user.password, password):
            if login_user(user):
                return redirect(url_for("main_page"))
            else:
                return render_template("login.html", error="Algo ha ido mal")
        else:
            return render_template("login.html", error="Contraseña/Usuario incorrecto")

    return render_template("login.html")

@notas_app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("main_page"))


@notas_app.route('/', methods=['GET'])
@login_required
def main_page():
    return render_template('directory.html')

@notas_app.route('/<path:slug>', methods=['GET'])
@login_required
def view_note(slug=''):
    if slug.endswith('.png') or slug.endswith('.jpg'):
        return send_from_directory(directory=os.path.dirname(os.path.join(NOTES_DIR, slug)), path=os.path.basename(slug))

    if os.path.isdir(os.path.join(NOTES_DIR, slug)) and os.path.exists(os.path.join(NOTES_DIR, slug)):
        return render_template('directory.html')

    if slug.endswith('.md') and os.path.exists(os.path.join(NOTES_DIR, slug)):
        return render_template('note.html')
    
    return 'File or directory not found', 404


notas_app.register_blueprint(api)

if __name__ == '__main__':
    notas_app.run(debug=True, port=8585)
