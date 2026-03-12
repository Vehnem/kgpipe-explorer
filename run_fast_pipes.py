from kgpipe_tasks.tasks import paris_entity_matching, paris_exchange, fusion_first_value, type_inference_ontology_simple
from kgpipe.common import KgPipe, Data, DataFormat

def rdf_paris():
    pipe = KgPipe(seed=Data(path="data/rdf/source.nt", format=DataFormat.RDF_NTRIPLES),
        name="rdf_paris",
        tasks=[paris_entity_matching, 
        paris_exchange, 
        fusion_first_value, 
        type_inference_ontology_simple]
    )

    pipe.build(
        source=Data(path="data/rdf/source.nt", format=DataFormat.RDF_NTRIPLES), 
        result=Data(path="data/rdf/result.nt", format=DataFormat.RDF_NTRIPLES)
    )
    pipe.run()
    