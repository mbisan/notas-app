import os
import re

NOTES_DIR = os.environ.get('NOTES_DIR', './notas')


def get_files_and_directories(path, rootpath):
    result = []
    for f in os.listdir(path):
        cur_path = os.path.join(path, f)
        path_url = cur_path.replace(os.path.abspath(NOTES_DIR), '')
        if f in ['papelera']:
            continue
        if os.path.isdir(cur_path):
            subdir = get_files_and_directories(cur_path, rootpath)
        else:
            subdir = None

        result.append({
            'path': path_url,
            'isImage': path_url.endswith('.png') or path_url.endswith('.jpg'),
            'name': f,
            'is_dir': False if subdir is None else True,
            'children': subdir
        })

    return sorted(result, key=lambda x: x['name'] if x['children'] is None else '_' + x['name'])

def list_all_files_and_directories(start_path):
    all_items = []
    for root, dirs, files in os.walk(start_path):
        if root.replace(os.path.abspath(NOTES_DIR), '').startswith('/papelera'):
            continue

        all_items.append(root.replace(os.path.abspath(NOTES_DIR), '')) 
            
        for file in files:
            full_path = os.path.join(root, file).replace(os.path.abspath(NOTES_DIR), '')
            all_items.append(full_path)
            
    return sorted([item if len(item)>0 else '/' for item in all_items])

def read_file(file_path, include_paths: bool = True):
    with open(file_path, 'r') as f:
        raw_data = f.read()

    regex_pattern = re.compile(r'<!--\s*(.*?)\s*-->(.*?)<!--\s*end\s*-->', re.DOTALL)

    blocks = []
    for i, (header, content) in enumerate(re.findall(regex_pattern, raw_data)):
        header_values: dict = eval('{' + header + '}')
        if include_paths:
            blocks.append({
                'content': content.strip(),
                'link': file_path,
                **header_values
            })
        else:
            blocks.append({
                'content': content.strip(),
                **header_values
            })
    
    return blocks
