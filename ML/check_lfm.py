import pickle
from pathlib import Path

model_path = Path(__file__).with_name("lightfm_model.pkl")

with model_path.open('rb') as f:
    lightfm_data = pickle.load(f)

model = lightfm_data['model']
dataset = lightfm_data['dataset']
item_map = dataset.mapping()[2]
print(f"Total items in mapping: {len(item_map)}")
print("Sample mapped item IDs:", list(item_map.keys())[:5])
