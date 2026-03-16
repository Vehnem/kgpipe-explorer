

# Stats, triple count, entity count, relation count, graph density, average degree, connected components
# Resources, runtime, memory usage, cost
# Semantics, disjoint domain violations, incorrect relation direction, incorrect relation cardinality, incorrect relation domain/range, incorrect datatypes, ontology class coverage, ontology relation coverage, namespace coverage
# Reference, entity matching (precision, recall, F1), relation matching (precision, recall, F1), triple alignment, source typed entity coverage, reference class coverage

from kgpipe.evaluation import Evaluator, EvaluationConfig, EvaluationAspect
from kgpipe.common.models import KG, DataFormat
from pathlib import Path

def evaluate_stats(kg: KG):
    evaluator = Evaluator(EvaluationConfig(aspects=[EvaluationAspect.STATISTICAL]))
    return evaluator.evaluate(kg)
