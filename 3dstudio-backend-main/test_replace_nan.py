import json
import math

json_str = '{"max": [NaN, NaN]}'
parsed = json.loads(json_str)

def replace_nan(obj):
    if isinstance(obj, float) and math.isnan(obj):
        return 0.0
    elif isinstance(obj, dict):
        return {k: replace_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [replace_nan(v) for v in obj]
    return obj

fixed = replace_nan(parsed)
new_json_str = json.dumps(fixed, separators=(',', ':'))

print("Original:", json_str)
print("Parsed:", parsed)
print("Fixed dict:", fixed)
print("New JSON string:", new_json_str)
