{% for bloque in bloques %}<!-- "type": "{{ bloque.type }}", "created": "{{ bloque.created }}", "modified": "{{ bloque.modified }}" -->
{{ bloque.content }}
<!-- end -->
{% endfor %}