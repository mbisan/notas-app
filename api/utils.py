import os

NOTES_DIR = os.environ.get('NOTES_DIR', './notas')


def get_files_and_directories(path, rootpath):
    result = []
    for f in os.listdir(path):
        cur_path = os.path.join(path, f)
        path_url = cur_path.replace(os.path.abspath(rootpath), '')
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
        all_items.append(root.replace(os.path.abspath(NOTES_DIR), '')) 
            
        for file in files:
            full_path = os.path.join(root, file).replace(os.path.abspath(NOTES_DIR), '')
            all_items.append(full_path)
            
    return sorted([item if len(item)>0 else '/' for item in all_items])
