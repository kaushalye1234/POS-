import re
import os

path = 'pos-main/simple-pos/dashboard.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'<a\s+href=[\'"]([^\'"]+)[\'"]([^>]*)>(.*?)</a>', 
                 r'<span onclick="window.location.href=\'\1\'" style="cursor:pointer;"\2>\3</span>', 
                 content, flags=re.IGNORECASE | re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
