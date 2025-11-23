FROM python:3.13-slim

RUN pip install flask==3.1.2 flask-login==0.6.3 flask-sqlalchemy==3.1.1 gunicorn==23.0.0

WORKDIR /usr/src/app

COPY . .
RUN rm -rf instance
RUN rm -rf notas

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "notas_app:notas_app"]
