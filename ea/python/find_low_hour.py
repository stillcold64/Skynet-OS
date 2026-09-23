import pandas as pd
import numpy as np

# Load H1
df = pd.read_csv('ea/python/xauusd_h1.csv')
df['time'] = pd.to_datetime(df['time'])
df = df.iloc[-16105:].copy().reset_index(drop=True)
df['date'] = df['time'].dt.date
df['dow'] = df['time'].dt.dayofweek

tuesdays = df[df['dow'] == 1]

# What hour does Tuesday reach its lowest price?
min_hours = []
for d, g in tuesdays.groupby('date'):
    if len(g) < 15: continue
    min_idx = g['low'].idxmin()
    min_hour = g.loc[min_idx, 'time'].hour
    min_hours.append(min_hour)

m_series = pd.Series(min_hours)
print("Distribution of Lowest Price Hour on Tuesdays (2024-2026):")
print(m_series.value_counts().sort_index())
