import os

def print_tree(startpath):
    exclude_dirs = {'.git', 'node_modules', '__pycache__', '.venv', '.next', 'build'}
    for root, dirs, files in os.walk(startpath):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * (level)
        print('{}{}/'.format(indent, os.path.basename(root)))
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            print('{}{}'.format(subindent, f))

print_tree(r'C:\Users\USER\OneDrive\Desktop\AutoOD\AutoOD-main')
