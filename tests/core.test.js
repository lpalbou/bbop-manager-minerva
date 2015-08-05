////
//// Some unit testing for package bbop-rest-manager.
////

var chai = require('chai');
chai.config.includeStack = true;
var assert = chai.assert;
var minerva_manager = require('..');

var us = require('underscore');

var minerva_requests = require('minerva-requests');
var request_set = minerva_requests.request_set;

var noctua_model = require('bbop-graph-noctua');

// Correct environment, ready testing.
var bbop = require('bbop-core');
var barista_response = require('bbop-response-barista');
// The likely main scripting engine.
var sync_engine = require('bbop-rest-manager').sync_request;
// The likely main browser engine.
var jquery_engine = require('bbop-rest-manager').jquery;
// Everybody else engine.
var node_engine = require('bbop-rest-manager').node;

///
/// Start unit testing.
///

//var barista_location = 'http://localhost:3400';
//var barista_profile = 'minerva_local';
var barista_location = 'http://toaster.lbl.gov:3399';
var barista_profile = 'minerva_public_dev';
//var barista_location = 'http://barista.berkeleybop.org';
//var barista_profile = 'minerva_public';

describe('overall bbop-manager-minerva', function(){

    it('trying the basics with an easy manager (sync)', function(){

	// Create an engine (technically a lower-level manager) to
	// make it all run.
	var engine_to_use = new sync_engine(barista_response);
	//var engine_to_use = new node_engine(barista_response);
	//engine_to_use.debug(true);
	//engine_to_use.method('GET');
	engine_to_use.method('GET');
	var manager = new minerva_manager(barista_location, barista_profile,
					  null, engine_to_use, 'sync');
	
	var r = manager.get_meta();
	//console.log('r', r.models_meta());
	assert.isAbove(r.relations().length, 0, 'has rels');
	assert.isAbove(us.keys(r.models_meta()).length, 0, 'has model meta');
	assert.isAbove(r.model_ids().length, 0, 'has model ids');
	assert.isAbove(r.evidence().length, 0, 'has ev');

    });

    it('trying the basics with an async manager', function(done){

	// 
	var engine_to_use = new node_engine(barista_response);
	var manager = new minerva_manager(barista_location, barista_profile,
					  null, engine_to_use, 'async');

	// 
	manager.get_meta().then(function(r){
	    assert.isAbove(r.relations().length, 0, 'has rels');
	    assert.isAbove(us.keys(r.models_meta()).length, 0, 'has model meta');
	    assert.isAbove(r.model_ids().length, 0, 'has model ids');
	    assert.isAbove(r.evidence().length, 0, 'has ev');
	    done();
	}).done();

    });
});

describe('model work using jQuery', function(){

    var mock_jQuery = null;
    var engine_to_use = null;
    var manager = null;
    before(function(done){
        // Modify the manager into functioning--will need this to get
        // tests working for jQuery in this environment.
        var domino = require('domino');
        mock_jQuery = require('jquery')(domino.createWindow());
        var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
        mock_jQuery.support.cors = true;
        mock_jQuery.ajaxSettings.xhr = function() {
            return new XMLHttpRequest();
        };

	// Setup a reusable engine and manager.
	// We need to do some fiddling to get the jQuery manager to
	// operate correctly in this land of node.
	engine_to_use = new jquery_engine(barista_response);
	engine_to_use.JQ = mock_jQuery;

	// Manager init.
	manager = new minerva_manager(barista_location, barista_profile,
				      null, engine_to_use, 'async');

	done();
    });

    it('trying the basics with a jQuery manager', function(done){

	// 
	manager.get_meta().then(function(r){
	    assert.isAbove(r.relations().length, 0, 'has rels');
	    assert.isAbove(us.keys(r.models_meta()).length, 0, 'has model meta');
	    assert.isAbove(r.model_ids().length, 0, 'has model ids');
	    assert.isAbove(r.evidence().length, 0, 'has ev');
	    done();
	}).done();

    });

    it('things we know about a model', function(done){
	this.timeout(60000); // doing a much of things, could take a while

	// Like there is one, and it needs at least a single
	// individual to be saved right now.
	manager.get_meta().then(function(r){
	
	    assert.isAbove(r.model_ids().length, 0, 'has model ids');
	    var mids = r.model_ids();
	    var mid = mids[0]; // any would be fine
	    
	    return manager.get_model(mid);

	}).then(function(r){

	    var data = r.data();
	    var graph = new noctua_model.graph();
	    graph.load_data_basic(data);
	    //assert.isAbove(r.model_ids().length, 0, 'has model ids');
	    //console.log(graph);
	    assert.isAbove(graph.all_nodes().length, 0, 'has indivs');

	    done();
	}).done();
	
    });
});
