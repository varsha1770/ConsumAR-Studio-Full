import json
import math

parsed = {'max': [float('nan'), float('nan')], 'other': float('inf')}

def replace_nan(obj):
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return obj
    elif isinstance(obj, dict):
        return {k: replace_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [replace_nan(v) for v in obj]
    return obj

fixed = replace_nan(parsed)

try:
    s = json.dumps(fixed, separators=(',', ':'), allow_nan=False)
    print("Success:", s)
except ValueError as e:
    print("Caught NaN/Inf:", e)
