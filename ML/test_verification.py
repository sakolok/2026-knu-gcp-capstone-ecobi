import pickle
import pandas as pd
import xgboost as xgb
from db_connector import list_all_tables, load_table_to_df

# Load
all_tables = list_all_tables()
required = ['user_profiles', 'foods', 'meal_candidates', 'meal_candidate_items', 'food_logs', 'recommendation_candidates', 'user_item_interactions', 'recommendation_runs', 'user_allergens', 'food_allergens']
all_dfs = {t: load_table_to_df(t) for t in required if t in all_tables}

with open('lightfm_model.pkl', 'rb') as f:
    lightfm_data = pickle.load(f)
xgb_model = xgb.XGBClassifier()
xgb_model.load_model('xgboost_model.json')

# Import generated functions from result.py
import sys
sys.path.append('.')
from result import generate_meal_candidates, calculate_lightfm_scores, calculate_xgboost_probabilities, calculate_mmr_penalties

# Test directly
meal_cands, meal_items = generate_meal_candidates(1, 2174, 13000, all_dfs)
print("--- 1. MILP 식단 생성 ---")
for c in meal_cands:
    print(f"Candidate ID: {c['candidate_id']}, Name: {c['candidate_name']}, Cals: {c['total_calories_kcal']}, Price: {c['total_price_krw']}")

lfm_scores = calculate_lightfm_scores(1, meal_cands, lightfm_data)
print("\n--- 2. LightFM 스코어 ---")
print(lfm_scores)

xgb_probs = calculate_xgboost_probabilities(1, meal_cands, meal_items, all_dfs, xgb_model)
print("\n--- 3. XGBoost 스코어 ---")
print(xgb_probs)

mmr_pens = calculate_mmr_penalties(1, meal_cands, meal_items, all_dfs)
print("\n--- 4. MMR 페널티 ---")
print(mmr_pens)

print("\n--- 5. 최종 점수 검증 ---")
for cid in lfm_scores.keys():
    lfm = lfm_scores[cid]
    xgb_s = xgb_probs[cid]
    mmr, fp = mmr_pens[cid]
    final = (xgb_s * 0.5) + (lfm * 0.3) - mmr - fp
    print(f"Cand {cid}: XGB({xgb_s:.4f})*0.5 + LFM({lfm:.4f})*0.3 - MMR({mmr}) - FP({fp}) = {final:.6f}")

