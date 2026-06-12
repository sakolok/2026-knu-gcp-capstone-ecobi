import pandas as pd
import numpy as np
import random
import xgboost as xgb
from lightfm.data import Dataset
from lightfm import LightFM
import pickle
from db_connector import list_all_tables, load_table_to_df
import warnings
warnings.filterwarnings('ignore')

# 1. Load Data
all_tables = list_all_tables()
required = ['user_profiles', 'meal_candidates', 'meal_candidate_items', 'foods', 'recommendation_runs', 'recommendation_candidates', 'user_item_interactions']
all_dfs = {t: load_table_to_df(t) for t in required if t in all_tables}

# 2. Train LightFM
interactions = all_dfs.get('user_item_interactions', pd.DataFrame())
interactions = interactions.dropna(subset=['candidate_id'])
dataset = Dataset()
dataset.fit(users=interactions['user_id'].unique(), items=interactions['candidate_id'].unique())
(interactions_matrix, _) = dataset.build_interactions((row['user_id'], row['candidate_id']) for idx, row in interactions.iterrows())
lfm_model = LightFM(loss='warp', no_components=30, random_state=42)
lfm_model.fit(interactions_matrix, epochs=10, num_threads=2)
with open('lightfm_model.pkl', 'wb') as f:
    pickle.dump({'model': lfm_model, 'dataset': dataset}, f)
print("LightFM model saved.")

# 3. Train XGBoost
profiles = all_dfs['user_profiles']
candidates = all_dfs['meal_candidates']
cand_items = all_dfs['meal_candidate_items']
foods = all_dfs['foods']
rec_cands = all_dfs.get('recommendation_candidates', pd.DataFrame())
rec_runs = all_dfs.get('recommendation_runs', pd.DataFrame())

if not rec_runs.empty and not rec_cands.empty:
    rc_full = rec_cands.merge(rec_runs[['run_id', 'user_id']], on='run_id', how='left')
else:
    rc_full = pd.DataFrame(columns=['user_id', 'candidate_id', 'was_selected', 'lightfm_score'])

pos_data = rc_full[rc_full['was_selected'] == True].copy()
pos_data['label'] = 1

neg_samples = []
all_cand_ids = candidates['candidate_id'].unique()
for user_id in pos_data['user_id'].unique():
    user_pos_cands = pos_data[pos_data['user_id'] == user_id]['candidate_id'].unique()
    possible_negs = list(set(all_cand_ids) - set(user_pos_cands))
    num_pos = len(pos_data[pos_data['user_id'] == user_id])
    num_neg = min(len(possible_negs), num_pos * 3)
    if possible_negs:
        selected_negs = random.sample(possible_negs, num_neg)
        for c_id in selected_negs:
            neg_samples.append({'user_id': user_id, 'candidate_id': c_id, 'label': 0})
            
neg_df = pd.DataFrame(neg_samples)
full_df = pd.concat([pos_data[['user_id', 'candidate_id', 'label']], neg_df], ignore_index=True)

profiles['goal_type_enc'] = profiles['goal_type'].map({'diet': 0, 'bulk': 1, 'maintain': 2}).fillna(-1)
profiles['sex_enc'] = profiles['sex'].map({'M': 0, 'F': 1}).fillna(-1)
full_df = full_df.merge(profiles[['user_id', 'age_years_snapshot', 'activity_factor', 'goal_type_enc', 'sex_enc']], on='user_id', how='left')
full_df = full_df.merge(candidates[['candidate_id', 'total_price_krw', 'total_calories_kcal', 'total_protein_g', 'total_fat_g', 'total_carbs_g']], on='candidate_id', how='left')

food_stats = cand_items.merge(foods[['food_id', 'is_low_fat', 'is_high_protein']], on='food_id')
meal_stats = food_stats.groupby('candidate_id').agg({'is_low_fat': 'sum', 'is_high_protein': 'sum'}).reset_index()
meal_stats.columns = ['candidate_id', 'count_low_fat', 'count_high_protein']

full_df = full_df.merge(meal_stats, on='candidate_id', how='left').fillna(0)
feature_cols = ['age_years_snapshot', 'activity_factor', 'goal_type_enc', 'sex_enc', 
                'total_price_krw', 'total_calories_kcal', 'total_protein_g', 'total_fat_g', 'total_carbs_g',
                'count_low_fat', 'count_high_protein']

X = full_df[feature_cols]
y = full_df['label']

xgb_model = xgb.XGBClassifier(n_estimators=100, max_depth=6, learning_rate=0.1, objective='binary:logistic', random_state=42, eval_metric='logloss')
xgb_model.fit(X, y)
xgb_model.save_model('xgboost_model.json')
print("XGBoost model saved.")
