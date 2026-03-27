import os

def write_tree(start_path, output_file):
    with open(output_file, "w", encoding="utf-8") as f:
        for root, dirs, files in os.walk(start_path):
            # Szint meghatározása
            level = root.replace(start_path, "").count(os.sep)
            indent = "    " * level
            folder_name = os.path.basename(root)

            f.write(f"{indent}📁 {folder_name}\n")

            sub_indent = "    " * (level + 1)
            for file in files:
                f.write(f"{sub_indent}📄 {file}\n")


if __name__ == "__main__":
    start_directory = r"D:\Munka\Agentify\docuagent_v3"   # <-- ezt módosítsd
    output_txt = "folder_tree.txt"

    write_tree(start_directory, output_txt)

    print(f"Kész! A struktúra ide mentve: {output_txt}")