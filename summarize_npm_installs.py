import re
import os

content = open("output_npm.txt", "r").read()
packages = re.split(r'--- START: (.*?) ---', content)

results = []
for i in range(1, len(packages), 2):
    path = packages[i]
    block = packages[i+1]
    name = path.split('/')[-1]
    
    if "FAILED: " + path in block or "npm ERR!" in block:
        # Extract relevant error
        err_match = re.search(r'(npm ERR!.*)', block, re.DOTALL)
        err_excerpt = err_match.group(1).strip() if err_match else "Unknown error"
        results.append(f"Package: {name}\nPath: {path}\nStatus: Failure\nCommand: npm i\nError: {err_excerpt[:500]}...")
    else:
        results.append(f"Package: {name}\nStatus: Success")

print("\n\n".join(results))
