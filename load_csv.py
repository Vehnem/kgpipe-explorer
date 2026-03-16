

"""
Loads the moveikg all metrics csv into the sparql system graph
MetricRun
Value: float
"""

import pandas as pd
from kgpipe.common.systemgraph import PipeKG

path = "/home/marvin/project/data/out/large/paper/test_wide_table_smoth.csv"

def _load_metrics_csv(csv_path: str):
    df = pd.read_csv(csv_path)
    for index, row in df.iterrows():
        PipeKG.add_metric_run(MetricRunEntity(
            name=row["Name"],
            value=row["Value"],
        ))

    return df

