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

describe('overall bbop-manager-minerva (sync)', function(){

    it('trying the basics with an easy manager', function(){

	// Create an engine (technically a lower-level manager) to
	// make it all run.
	var engine_to_use = new sync_engine(barista_response);
	//var engine_to_use = new node_engine(barista_response);
	//engine_to_use.debug(true);
	//engine_to_use.method('GET');
	engine_to_use.method('GET');
	// var manager = new minerva_manager('http://barista.berkeleybop.org',
	// 				  'minerva_public',
	var manager = new minerva_manager('http://localhost:3400',
					  'minerva_local',
					  null,
					  engine_to_use,
					  'sync');
	
	var r = manager.get_meta();
	//console.log('r', r.models_meta());
	assert.isAbove(r.relations().length, 0, 'has rels');
	assert.isAbove(us.keys(r.models_meta()).length, 0, 'has models meta');
	assert.isAbove(r.model_ids().length, 0, 'has model ids');
	assert.isAbove(r.evidence().length, 0, 'has ev');

    });
});

// describe('try against a real server', function(){

//     it('make a connect and look', function(){

// 	// TODO: Like before, but we may need to do some fiddling to
// 	// get the jQuery manager to operat right.

//     });
// });
