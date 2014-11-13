if (Meteor.isServer) {


	Meteor.startup(function () {
		// code to run on server at startup
		//Meteor.call('getEndpointStructure', 'http://190.15.141.102:8890/sparql', 'http://dspace.ucuenca.edu.ec/resource/');
		//Meteor.call('pingServer', 'http://190.15.141.102:8890/sparql');

		var SparqlParser = Meteor.npmRequire('sparqljs').Parser;
		var parserInstance = new SparqlParser();
		
		Meteor.methods({

			parseQuery: function(jsonQuery) {

			},

			doQuery: function(jsonQuery) {
				console.log(jsonQuery);
				try{
					console.log( parserInstance.parse('PREFIX foaf: <http://xmlns.com/foaf/0.1/> ' +
		                         'SELECT * { ?mickey foaf:name "Mickey Mouse"@en; foaf:knows ?other. }') );
				}catch(e){
					console.log(e);
				}

			},

			saveQuery: function(request) {
				result = {};
				result.msg = 'OK';
				try{
					console.log( parserInstance.parse('PREFIX foaf: <http://xmlns.com/foaf/0.1/> ' +
		                         'SELECT * { ?mickey foaf:name "Mickey Mouse"@en; foaf:knows ?other. }') );
					console.log('user ==> ' + this.userId);
					Queries.insert({user: '', title: request.title, description: request.description, 
						jsonGraph: JSON.stringify(request.jsonQuery), sparql: ''});
				}catch(e){
					console.log(e);
					result.msg = e
				}
				return result;
			},



			updatePrefixes: function() {
				HTTP.get( 'http://prefix.cc/context', function(error, result){
					if(result.statusCode == '200' && !error) {
						result = EJSON.parse(result.content);
						result = result['@context'];
						var ci = 0;
						var ce = 0;
						if(!_.isUndefined(result)) {
							for(var prfx in result) {
								var prfCursor = Prefixes.find({prefix: prfx});
								if(prfCursor.count() <= 0) {
									Prefixes.insert({ prefix: prfx, URI: result[prfx] });
									ci++;
								} else {
									ce++;
								}
							}
						}
						console.log('Updating prefixes schema using prefix.cc service: Already Saved: ' + ce + ' New Records: ' + ci);
					} else {
						console.log('Error while getting Prefixes from service prefix.cc. Possible cause: ' + error);
					}
				});
				
			},	

			runQuery: function(endpointURI, defaultGraph, query, format, timeout) {
				format = _.isUndefined(format) ? 'application/sparql-results+json':format;
				timeout = _.isUndefined(timeout) ? '0': timeout;
				return HTTP.get( endpointURI, 
						{
							'params':
								{
									'default-graph-uri': defaultGraph,
									'query': query,
									'format': format,
									'timeout': timeout
								}
						});

			},

			pingServer: function(endpointURI, defaultGraph) {
				var response = {};
				try {
					var result = Meteor.call('runQuery', endpointURI, '', 'ask {graph <' + defaultGraph + '> {?s ?p ?o}}', undefined, 10000);
					var content = EJSON.parse(result.content);
					
					response.statusCode = result.statusCode;
					if(result.statusCode != 200) {
						response.msg = "Error trying to communicate with endpoint " + endpointURI;
					} else if(result.statusCode == 200  && content.boolean == true) {
						response.msg = '';
					} else if(result.statusCode == 200  && content.boolean == false) {
						response.msg = "Graph <"+ defaultGraph + "> does not exists on endpoint " + endpointURI;
					}
				}catch(e){
					response.statusCode = 404;
					response.msg = "Error trying to communicate with endpoint " + endpointURI;
					response.stack = e.stack;
				}
				
				return response;
			},

			findPrefix: function(URIMap) {
				var idx = URIMap.lastIndexOf('#') > 0 ? URIMap.lastIndexOf('#'): URIMap.lastIndexOf('/');
				var uri = URIMap.substring(0, idx+1);
				var response = {};
				var Prefix = Prefixes.findOne({URI: uri});
				response.prefix = _.isUndefined(Prefix) ? '': Prefix.prefix;
				response.property = URIMap.substring(idx+1);
				return response;
			},

			fetchGraphSchema: function(endpointURI, defaultGraph) {
				var muestra;
				console.log('==Obtaining graph description of <' + defaultGraph + '> from ' + endpointURI + '==');
						
				var result = Meteor.call('runQuery', endpointURI, defaultGraph, 'select distinct ?o where{ ?s a ?o}');
				
				var rsEntities = EJSON.parse(result.content);

				var dataset = [];
				var datasetRDF = {};
				_.each(rsEntities.results.bindings, function(el, idx, list) {
					var subject = el.o.value;

					console.log('=>Obtaining subject properties of: ' + subject);
					var rsMuestra = Meteor.call('runQuery', endpointURI, defaultGraph, 
						'select distinct ?s where{ ?s a <' + subject + '>} limit 10');

					var rsMuestra = EJSON.parse(rsMuestra.content);
					var predicateArray = {};
					_.each(rsMuestra.results.bindings, function(el, idx, list) {
						var entity = el.s.value;
						
						console.log('==>Graph Entity sample: ' + entity);
						var rsPredicate = Meteor.call('runQuery', endpointURI, defaultGraph, 'describe <' + entity + '>');
						
						rsPredicate = EJSON.parse(rsPredicate.content);
						_.each(rsPredicate.results.bindings, function(el, idx, list) {
							//console.log('Predicate:' + el.p.value);

							////////////////////
							var predicateObj = {};
							predicateObj.fullName = el.p.value;
							predicateObj.prefix = '';
							predicateObj.name = '';
							
							/////////////////////

							if(_.isUndefined(predicateArray[el.p.value])) {
								var objectObj = {};
								objectObj.objectEntity = {};
								objectObj.dataType = el.o.datatype;
								objectObj.sampleValue = el.o.value.substring(0,100);
							
								if(el.o.type === 'uri' && subject != el.o.value) {
									
									console.log('==>Looking entity type for object <' + el.o.value +'>');
									var rsObjSubject = Meteor.call('runQuery', endpointURI, defaultGraph, 
										'select ?o where { <' + el.o.value +'> a ?o }');
									
									rsObjSubject = EJSON.parse(rsObjSubject.content);

									objectObj.objectEntity.fullName = null;
									objectObj.objectEntity.prefix = null;
									objectObj.objectEntity.name = null;
									//if found results
									if(rsObjSubject.results.bindings.length > 0) {
										var objectURI = rsObjSubject.results.bindings[0].o.value;
										var responsePrefix = Meteor.call('findPrefix', objectURI);
										objectObj.objectEntity.fullName = objectURI;
										objectObj.objectEntity.prefix = responsePrefix.prefix;
										objectObj.objectEntity.name = responsePrefix.property;
									}			
								}
								predicateArray[el.p.value] = objectObj;
							}
							
							
							muestra = predicateArray;
							//muestra = {subjectObj: subject, predicate: predicateObj, objectP: objectObj};
							//console.log('===>Subject: ' + subject + '| Predicate:' + el.p.value + '| Object:' + object + '| Type:' + type + '| Datatype:' + datatype);
							/*
							console.log('===>Subject: ' + subject + '| Predicate:' + predicateObj.fullName 
								+ '| Object:' + (objectObj.objectEntity||objectObj.dataType) + '| SampleValue:' + objectObj.sampleValue);
							*/

						});

					});
					
					
					var aux = {};
					var cont = 0;
					for(var predicate in predicateArray) {
						cont++;
						var responsePrefix = Meteor.call('findPrefix', predicate);
						/*var idx = predicate.lastIndexOf('#') > 0 ? predicate.lastIndexOf('#'): predicate.lastIndexOf('/');
						var uri = predicate.substring(0, idx+1);
						var property = predicate.substring(idx+1);
						var Prefix = Prefixes.findOne({URI: uri});
						Prefix.prefix = _.isUndefined(Prefix) ? '': Prefix.prefix;
						*/
						var objectObj = predicateArray[predicate];
						var subjectPrefix = Meteor.call('findPrefix', subject);
						var register = {
				                endpoint: endpointURI,
				                graphURI: defaultGraph,
				                subject: {fullName: subject, prefix: subjectPrefix.prefix, name: subjectPrefix.property },
				                predicate: { fullName: predicate, prefix: responsePrefix.prefix, name: responsePrefix.property},
				                objectType: objectObj
				            };
				        Graphs.insert(register);
				        dataset.push(register);
						/*Graphs.insert(
				            {
				                endpoint: endpointURI,
				                graphURI: defaultGraph,
				                subject: {fullName: subject, prefix: subjectPrefix.prefix, name: subjectPrefix.property },
				                predicate: { fullName: predicate, prefix: responsePrefix.prefix, name: responsePrefix.property},
				                objectType: objectObj
				            }
				        );*/



				        console.log('===>SAVED: Subject: ' + subject + ' prefix: ' + subjectPrefix.prefix + ' property: ' + subjectPrefix.property 
				        		+ '| Predicate:' + predicate + ' prefix: ' + responsePrefix.prefix + ' property: ' + responsePrefix.property
								+ '| Object:' 
									+ (_.isUndefined(objectObj.objectEntity.fullName) ? '': (objectObj.objectEntity.fullName + ' prefix: ' + objectObj.objectEntity.prefix + ' property: ' + objectObj.objectEntity.name)) 
									+ (objectObj.dataType ? objectObj.dataType:'')
								+ '| SampleValue:' + objectObj.sampleValue);

						
				        var subjectItem = {fullName: subject, prefix: subjectPrefix.prefix, name: subjectPrefix.property};
						if(_.isUndefined(datasetRDF[predicate])) {
							datasetRDF[predicate] = {};
							datasetRDF[predicate].endpoint = endpointURI;
							datasetRDF[predicate].graphURI = defaultGraph;
							datasetRDF[predicate].fullName = predicate;
							datasetRDF[predicate].prefix = responsePrefix.prefix;
							datasetRDF[predicate].name = responsePrefix.property;
							datasetRDF[predicate].subjects = [];
							datasetRDF[predicate].objectTypes = [];
						}
						datasetRDF[predicate].subjects.push(subjectItem);
						datasetRDF[predicate].objectTypes.push(objectObj);
						
					}
					//processing group by predicate registers model
					/*
					var arrays = {};
					c = _.groupBy(dataset, function(obj){return obj.predicate.fullName;});
					var counter = 0; 
			        for(property in c) {
			          d = c[property];
			          e = _.uniq(d, false, function(obj){return obj.subject.fullName + '-' + obj.objectType.objectEntity.fullName;});
			          f = _.pluck(e, 'subject');
			          g = _.pluck(e, 'objectType');
			          g = _.uniq(g, false, function(obj){return obj.dataType;});
			          propertyItem = {};
			          propertyItem.allowedEntities = f;
			          propertyItem.dataType = g;
			          arrays[property] = propertyItem;
			          Graphs2.insert({
			          	predicate: property, description: propertyItem
			          });
			          counter++;
			        }
			        console.log('==> prueba ' + counter + ' ' + arrays['http://id.loc.gov/vocabulary/relators/aut']);
			        */
				});

				var cont = 0;
				var str = '';
				for(var x in datasetRDF) {
					//console.log(datasetRDF[x]);
					Properties.insert(datasetRDF[x]);
					str = str + '||' + x;
					cont++;
				}
				console.log('==> contador == : ' + cont);
				console.log('==> predicados == : ' + str);
				return muestra;

			},

			getEndpointStructure: function(graphName, endpointURI, defaultGraph, graphDescription, updateGraph) {
					var endpoint = Endpoints.findOne({endpoint: endpointURI, graphURI: defaultGraph});
					var response = Meteor.call('pingServer', endpointURI, defaultGraph);
					if(response.statusCode != 200 || response.msg.length > 0) return response;
					var statusCode = response.msg.length == 0 ? 'A':'I';
					if(_.isUndefined(endpoint)) {
						console.log('==Inserting new endpoint');
						var color_id = '#'+Math.floor(Math.random()*16777215).toString(16);
						Endpoints.insert({name: graphName, colorid: color_id, endpoint: endpointURI, graphURI: defaultGraph, description: graphDescription, status: statusCode, lastMsg: response.msg});	
						updateGraph = true;
					} else {
						console.log('==Updating endpoint ' + endpointURI + '<' + defaultGraph + '>');
						Endpoints.update({_id: endpoint._id}, {$set: {status: statusCode}});
					}
					if(updateGraph) {
						Meteor.call('fetchGraphSchema', endpointURI, defaultGraph, function(error, result){
							console.log("Graph Schema fetching process finished for endpoint: " + endpointURI + ' <' + defaultGraph + '>')
							response.results = result;

						});

						/*
						console.log('==Obtaining graph description of <' + defaultGraph + '> from ' + endpointURI + '==');
						
						var result = Meteor.call('runQuery', endpointURI, defaultGraph, 'select distinct ?o where{ ?s a ?o}');
						
						var rsEntities = EJSON.parse(result.content);
						_.each(rsEntities.results.bindings, function(el, idx, list) {
							var subject = el.o.value;

							console.log('=>Obtaining subject properties of: ' + subject);
							var rsMuestra = Meteor.call('runQuery', endpointURI, defaultGraph, 
								'select distinct ?s where{ ?s a <' + subject + '>} limit 10');

							var rsMuestra = EJSON.parse(rsMuestra.content);
							var predicateArray = {};
							_.each(rsMuestra.results.bindings, function(el, idx, list) {
								var entity = el.s.value;
								
								console.log('==>Graph Entity sample: ' + entity);
								var rsPredicate = Meteor.call('runQuery', endpointURI, defaultGraph, 'describe <' + entity + '>');
								
								rsPredicate = EJSON.parse(rsPredicate.content);
								_.each(rsPredicate.results.bindings, function(el, idx, list) {
									//console.log('Predicate:' + el.p.value);

									////////////////////
									var predicateObj = {};
									predicateObj.fullName = el.p.value;
									predicateObj.prefix = '';
									predicateObj.name = '';
									
									/////////////////////

									if(_.isUndefined(predicateArray[el.p.value])) {
										var objectObj = {};
										objectObj.objectEntity = '';
										objectObj.dataType = el.o.datatype;
										objectObj.sampleValue = el.o.value.substring(0,100);
									
										if(el.o.type === 'uri' && subject != el.o.value) {
											
											console.log('==>Looking entity type for object <' + el.o.value +'>');
											var rsObjSubject = Meteor.call('runQuery', endpointURI, defaultGraph, 
												'select ?o where { <' + el.o.value +'> a ?o }');
											
											rsObjSubject = EJSON.parse(rsObjSubject.content);
											objectObj.objectEntity = rsObjSubject.results.bindings[0].o.value;;
										}
										predicateArray[el.p.value] = objectObj;
									}
									
									response.muestra = predicateArray;

								});

							});
							for(var predicate in predicateArray) {
								var idx = predicate.lastIndexOf('#') > 0 ? predicate.lastIndexOf('#'): predicate.lastIndexOf('/');
								var uri = predicate.substring(0, idx+1);
								var property = predicate.substring(idx+1);
								var Prefix = Prefixes.findOne({URI: uri});
								Prefix.prefix = _.isUndefined(Prefix) ? '': Prefix.prefix;
								var objectObj = predicateArray[predicate];

								Graphs.insert(
						            {
						                endpoint: endpointURI,
						                graphURI: defaultGraph,
						                subject: subject,
						                predicate: { fullName: predicate, prefix: Prefix.prefix, name: property},
						                objectType: objectObj,
						            }
						        );
						        console.log('===>SAVED: Subject: ' + subject + '| Predicate:' + predicate + ' prefix: ' + Prefix.prefix + ' property: ' + property
										+ '| Object:' + (objectObj.objectEntity||objectObj.dataType) + '| SampleValue:' + objectObj.sampleValue);
								
							}
						});*/
					}
					return response;

			}
		});

		//Update Prefixes schema on every server startup
		Meteor.call('updatePrefixes');
	});
}