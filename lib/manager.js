/**
 * Manager for handling communication and callbacks with a Minerva
 * instances (mediated by Barista).
 *
 * See also: {module:bbop-response-barista}
 *
 * @modules bbop-manager-minerva
 */

var bbop = require('bbop-core');
var registry = require('bbop-registry');

var us = require('underscore');

var class_expression = require('class-expression');
var requests = require('minerva-requests');
//var rest_manager = require('bbop-rest-manager');
var barista_response = require('bbop-response-barista');

// Aliasing.
var each = us.each;
var request = requests.request;
var request_set = requests.request_set;

/**
 * A manager for handling the AJAX and registry. Initial take from
 * {module:bbop-rest-manager}.
 * 
 * @constructor
 * @param {String} barista_location - string for invariant part of API
 * @param {String} namespace - string for namespace of API to use
 * @param {String} user_token - identifying string for the user of the manager (Barista token)
 * @param {Object} engine - Remote resource manager client to use (must be an instantiated {module:bbop-rest-manager} engine)
 * @param {String} mode - whether or not to have utility methods (most besides fetch_with and start_with be in); options are "sync" and "async", which correspond to internally using fetch and start respectively
 * @returns {manager} a classic manager
 */
var manager = function(barista_location, namespace, user_token, engine, mode){
    registry.call(this, ['prerun', // internal; anchor only
			 'postrun', // internal
			 'manager_error', // internal/external...odd
			 //'success', // uninformative
			 'merge',
			 'rebuild',
			 'meta',
			 'warning', // trump
			 'error' //trump
			]);
    this._is_a = 'bbop-manager-minerva';
    var anchor = this;

    //var url = barista_location + '/api/' + namespace + '/m3Batch';
    anchor._batch_url = null;
    anchor._seed_url = null;

    anchor._user_token = user_token;

    anchor._use_reasoner_p = false;

    anchor._use_groups = null;

    //  
    anchor._engine = engine;
    anchor._mode = mode;
    anchor._runner = function(resource, payload){
	var ret = null;
	if( anchor._mode === 'sync' ){
	    ret = anchor._engine.fetch(resource, payload);
	}else if( anchor._mode === 'async' ){
	    ret = anchor._engine.start(resource, payload);
	}else{
	    throw new Error('"mode" not set in new bbop-manager-minerva');
	}
	return ret;
    };

    // Will use this one other spot, where the user can change the
    // token.
    function _set_url_from_token(in_token){	

	var batch_url =
		barista_location + '/api/' + namespace + '/m3Batch';
	var seed_url =
		barista_location + '/api/' + namespace + '/seed/fromProcess';

	if( in_token ){
	    batch_url = batch_url + 'Privileged';
	    seed_url = seed_url + 'Privileged';
	}

	anchor._batch_url = batch_url;
	anchor._seed_url = seed_url;
    }
    _set_url_from_token(user_token);

    // How to deal with failure.
    function _on_fail(resp, man){	
	var retval = null;

	// See if we got any traction.
	if( ! resp || ! resp.message_type() || ! resp.message() ){
	    // Something dark has happened, try to put something
	    // together.
	    // console.log('bad resp!?: ', resp);
	    var resp_seed = {
		'message_type': 'error',
		'message': 'deep manager error'
	    };
	    resp = new barista_response(resp_seed);
	    retval = resp;
	}
	anchor.apply_callbacks('manager_error', [resp, anchor]);

	return retval;
    }
    anchor._engine.register('error', _on_fail);

    // When we have nominal success, we still need to do some kind of
    // dispatch to the proper functionality.
    function _on_nominal_success(resp, man){
	var retval = resp;
	
	// Switch on message type when there isn't a complete failure.
	var m = resp.message_type();
	if( m === 'error' ){
	    // Errors trump everything.
	    anchor.apply_callbacks('error', [resp, anchor]);
	}else if( m === 'warning' ){
	    // Don't really have anything for warning yet...remove?
	    anchor.apply_callbacks('warning', [resp, anchor]);
	}else if( m === 'success' ){
	    var sig = resp.signal();
	    if( sig === 'merge' || sig === 'rebuild' || sig === 'meta' ){
		//console.log('run on signal: ' + sig);
		anchor.apply_callbacks(sig, [resp, anchor]);		
	    }else{
		if( typeof(alert) === 'function' ){
		    alert('unknown signal: very bad: ' + sig);
		}
		console.log('unknown signal: very bad: ' + sig);
	    }
	}else{
	    if( typeof(alert) === 'function' ){
		alert('unimplemented message_type: ' + m);	    
	    }
	    console.log('unimplemented message_type: ' + m);
	}

	// Postrun goes no matter what.
	anchor.apply_callbacks('postrun', [resp, anchor]);

	return retval;
    }
    anchor._engine.register('success', _on_nominal_success);

    ///
    /// Control our identity and other meta operations.
    ///

    /**
     * Get/set the user token.
     * 
     * @param {String} [user_token] - string to set user token to
     * @returns {String} current user token
     */
    anchor.user_token = function(user_token){

	// Adjust the internal token.
	if( user_token ){
	    anchor._user_token = user_token;
	}

	// Make sure we're using the right URL considering how we're
	// identified.
	_set_url_from_token(anchor._user_token);

	return anchor._user_token;
    };

    /**
     * Get/set the use reasoner flag. Default false.
     * 
     * @param {Boolean} [bool] - optional value to set the reasoner
     * @returns {Boolean} current reasoner use value
     */
    anchor.use_reasoner_p = function(bool){

	// Adjust the internal token.
	if( typeof(bool) === 'boolean' ){
	    anchor._use_reasoner_p = bool;
	}

	return anchor._use_reasoner_p;
    };

    /**
     * Get/set the user groups list.
     * The argument is a list of group id strings.
     * An empty list or null or false value clears the group list.
     * 
     * @param {Array} [groups] - optional value to set the user groups
     * @returns {Array} current user groups list
     */
    anchor.use_groups = function(groups){

	// 
	if( groups === false || groups === null ){
	    anchor._use_groups = [];
	}else if( us.isArray(groups) ){
	    anchor._use_groups = us.clone(groups);
	}

	return us.clone(anchor._use_groups);
    };

    ///
    /// Actual mechanism.
    ///

    /**
     * Trigger a rebuild {module:bbop-response-barista} with a model.
     * 
     * Intent: "query".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.get_model = function(model_id){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.get_model();

 	return anchor.request_with(reqs);
    };
    
    // /*
    //  * Method: get_model_ids
    //  * 
    //  * Trigger meta {module:bbop-response-barista} with a list of all model
    //  * ids.
    //  * 
    //  * Intent: "query".
    //  * Expect: "success" and "meta".
    //  * 
    //  * @param {}    //  *  n/a
    //  * 
    //  * @returns {}    //  *  n/a
    //  */
    // anchor.get_model_ids = function(){

    // 	// 
    // 	var reqs = new request_set(anchor.user_token());
    // 	var req = new request('model', 'all-model-ids');
    // 	reqs.add(req);

    // 	var args = reqs.callable();	
    // 	anchor.apply_callbacks('prerun', [anchor]);
    // 	jqm.action(anchor._batch_url, args, 'GET');
    // };
    
    /**
     * Trigger meta {module:bbop-response-barista} with a list of all model
     * meta-information.
     * 
     * Intent: "query".
     * Expect: "success" and "meta".
     * 
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.get_meta = function(){

	var reqs = new request_set(anchor.user_token());
	reqs.get_meta();

 	return anchor.request_with(reqs);
    };

    /**
     * Trigger meta {module:bbop-response-barista} of requested
     * model's undo/redo information.
     * 
     * This will make the request whether or not the user has an okay
     * token defined.
     *
     * Intent: "query".
     * Expect: "success" and "meta".
     * 
     * @param {String} model_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.get_model_undo_redo = function(model_id){

	// 
	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.get_undo_redo();

 	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger rebuild {module:bbop-response-barista} after an attempt
     * to roll back the model to "last" state.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.perform_undo = function(model_id){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.undo_last_model_batch();

 	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger rebuild {module:bbop-response-barista} after an attempt
     * to roll forward the model to "next" state.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.perform_redo = function(model_id){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.redo_last_model_batch();

 	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger merge (or possibly a rebuild)
     * {module:bbop-response-barista} on attempt to add a single fact
     * to a model.
     *
     * Intent: "action".
     * Expect: "success" and "merge".
     * 
     * @param {String} model_id - string
     * @param {String} source_id - string
     * @param {String} target_id - string
     * @param {String} rel_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.add_fact = function(model_id, source_id, target_id, rel_id){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.add_fact([source_id, target_id, rel_id]);

 	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger merge (or possibly a rebuild)
     * {module:bbop-response-barista} on attempt to remove a single
     * fact to a model.
     *
     * Intent: "action".
     * Expect: "success" and "merge".
     * 
     * @param {String} model_id - string
     * @param {String} source_id - string
     * @param {String} target_id - string
     * @param {String} rel_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.remove_fact = function(model_id, source_id, target_id, rel_id){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.remove_fact([source_id, target_id, rel_id]);

 	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger merge (or possibly a rebuild)
     * {module:bbop-response-barista.response} on attempt to add a
     * simple composite unit (class, enabled_by, and occurs_in) to a
     * model.
     *
     * Intent: "action".
     * Expect: "success" and "merge".
     * 
     * @param {String} model_id - string
     * @param {String} cls_exp - anything taken by {module:class-expression}
     * @param {String} [enabled_by_expr] - anything taken by {module:class-expression}
     * @param {String} [occurs_in_expr] - anything taken by {module:class-expression}
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.add_simple_composite = function(model_id, cls_expr,
    					   enabled_by_expr, occurs_in_expr){

	// Minimal requirements.
	var reqs = new request_set(anchor.user_token(), model_id);
     	var ind = reqs.add_individual(cls_expr);

	// Optional set expressions.
	if( enabled_by_expr ){
	    reqs.add_type_to_individual(
		class_expression.svf(enabled_by_expr, 'RO:0002333'), ind);
	}
	if( occurs_in_expr ){
	    reqs.add_type_to_individual(
		class_expression.svf(occurs_in_expr, 'occurs_in'), ind);
	}

 	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger merge (or possibly a rebuild)
     * {module:bbop-response-barista.response} on attempt to add a
     * complex class expression to an individual in a model.
     *
     * Intent: "action".
     * Expect: "success" and "merge".
     * 
     * @param {String} model_id - string
     * @param {String} individual_id - string
     * @param {String} cls_expr - anything acceptible to {module:class-expression}
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.add_class_expression = function(model_id, individual_id, cls_expr){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.add_type_to_individual(cls_expr, individual_id);

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger merge (or possibly a rebuild) {module:bbop-response-barista}
     * on attempt to remove a complex class expression from an
     * individual in a model.
     *
     * Intent: "action".
     * Expect: "success" and "merge".
     * 
     * @param {String} model_id - string
     * @param {String} individual_id - string
     * @param {String} cls_expr - or anything acceptible to {module:class-expression}
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.remove_class_expression = function(model_id, individual_id, cls_expr){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.remove_type_from_individual(cls_expr, individual_id);

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild {module:bbop-response-barista} on attempt to remove
     * an individual from a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} individual_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.remove_individual = function(model_id, indv_id){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.remove_individual(indv_id);

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on
     * attempting to create a new model...from nothing. Or something!
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} taxon_id - *[DEPRECATED]* *[optional]* string (full ncbi)
     * @param {String} class_id - *[DEPRECATED]* *[optional]* string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.add_model = function(taxon_id, class_id){

	// Conditions taken care of by request_set.
	var reqs = new request_set(anchor.user_token());
	reqs.add_model({'class-id': class_id, 'taxon_id': taxon_id});
	
	return anchor.request_with(reqs);
    };
    
    /**
     * *[DEPRECATED]*
     * 
     * Trigger a meta {module:bbop-response-barista} containing model
     * export text.
     *
     * Intent: "action".
     * Expect: "success" and "meta".
     * 
     * @deprecated
     * @param {String} model_id - string
     * @param {String} [format] - string (for legacy, "gaf" or "gpad")
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.export_model = function(model_id, format){

	if( typeof(format) === 'undefined' ){ format = 'default'; }

	var reqs = new request_set(anchor.user_token());
	var req = null;
	if( format === 'gaf' ){
	    req = new request('model', 'export-legacy');
	    req.special('format', 'gaf');
	}else if( format === 'gpad' ){
	    req = new request('model', 'export-legacy');
	    req.special('format', 'gpad');
	}else{
	    // Default (non-legacy) case is simpler.
	    req = new request('model', 'export');
	}

	// Add the model to the request.
	req.model(model_id);
	reqs.add(req);

	return anchor.request_with(reqs);
    };
    
    /**
     * *[DEPRECATED]*
     * 
     * Trigger a rebuild response {module:bbop-response-barista} for a
     * new model seeded/created from the argument string.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @deprecated
     * @param {String} model_string - string representation of a model
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.import_model = function(model_string){

	// 
	var reqs = new request_set(anchor.user_token());
	var req = new request('model', 'import');
	req.special('importModel', model_string);
	reqs.add(req);

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on a
     * "permanent" store operation on a model.
     *
     * What?! A "rebuild" and not "meta"? Yes. This allows a workflow
     * where a model is created, edited, and stored all in one pass.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.store_model = function(model_id){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.store_model();

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a meta response {module:bbop-response-barista} on a
     * "permanent" store operation on all models.
     *
     * Intent: "action".
     * Expect: "success" and "meta".
     * 
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.store_all = function(){

	var reqs = new request_set(anchor.user_token());
	//reqs.store_all();
	reqs.export_all();

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on a
     * "permanent" store operation on a model.
     *
     * What?! A "rebuild" and not "meta"? Yes. This allows a workflow
     * where a model is created, edited, and stored all in one pass.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.store_model = function(model_id){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.store_model();

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on an
     * evidence addition referencing an individual in a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} indv_id - string
     * @param {String} evidence_id - string
     * @param {Array|String} source_ids - string or list of strings
     * @param {Array|String|null} with_strs - string or list of strings or null
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.add_individual_evidence = function(model_id, indv_id, evidence_id,
					      source_ids, with_strs){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.add_evidence(evidence_id, source_ids, with_strs, indv_id, model_id);
	
	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on an
     * evidence addition referencing a fact in a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} source_id - string
     * @param {String} target_id - string
     * @param {String} rel_id - string
     * @param {String} evidence_id - string
     * @param {Array|String} source_ids - string or list of strings
     * @param {Array|String|null} with_strs - string or list of strings or null
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.add_fact_evidence = function(model_id,
					source_id, target_id, rel_id,
					evidence_id, source_ids, with_strs){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.add_evidence(evidence_id, source_ids, with_strs,
			  [source_id, target_id, rel_id], model_id);

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on an
     * evidence addition referencing an individual in a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} evidence_individual_id - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.remove_evidence = function(model_id, evidence_individual_id){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.remove_evidence(evidence_individual_id, model_id);
	
	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on
     * updating an entities annotations to a new set.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {Object} entity - string
     * @param {String} key - string
     * @param {Array|String} values - string
     * @param {String|null} [value_type] - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.update_annotations = function(model_id, entity,
					 key, values, value_type){
	
	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.update_annotations(entity, key, values, value_type, model_id);
	
	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on an
     * annotation addition to an individual in a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} indv_id - string
     * @param {String} key - string
     * @param {String} value - string
     * @param {String|null} [value_type] - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.add_individual_annotation = function(model_id, indv_id,
						key, value, value_type){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.add_annotation_to_individual(key, value, value_type, indv_id);

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on an
     * annotation addition to a referenced fact (edge) in a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} source_id - string
     * @param {String} target_id - string
     * @param {String} rel_id - string
     * @param {String} key - string
     * @param {String} value - string
     * @param {String|null} [value_type] - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.add_fact_annotation = function(model_id,
					  source_id, target_id, rel_id,
					  key, value, value_type){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.add_annotation_to_fact(key, value, value_type,
				    [source_id, target_id, rel_id]);

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on an
     * annotation addition to a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} key - string
     * @param {String} value - string
     * @param {String|null} [value_type] - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.add_model_annotation = function(model_id, key, value, value_type){

        var reqs = new request_set(anchor.user_token(), model_id);
	reqs.add_annotation_to_model(key, value, value_type);

    return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on an
     * annotation removeal from an individual in a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} indv_id - string
     * @param {String} key - string
     * @param {String} value - string
     * @param {String|null} [value_type] - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.remove_individual_annotation = function(model_id, indv_id,
						   key, value, value_type){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.remove_annotation_from_individual(key, value, value_type, indv_id);

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on an
     * annotation removeal from a referenced fact (edge) in a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} source_id - string
     * @param {String} target_id - string
     * @param {String} rel_id - string
     * @param {String} key - string
     * @param {String} value - string
     * @param {String|null} [value_type] - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.remove_fact_annotation = function(model_id,
					     source_id, target_id, rel_id,
					     key, value, value_type){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.remove_annotation_from_fact(key, value, value_type,
					 [source_id, target_id, rel_id]);

	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on an
     * annotation removal from a model.
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} model_id - string
     * @param {String} key - string
     * @param {String} value - string
     * @param {String|null} [value_type] - string
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.remove_model_annotation = function(model_id, key, value, value_type){

	var reqs = new request_set(anchor.user_token(), model_id);
	reqs.remove_annotation_from_model(key, value, value_type);

	return anchor.request_with(reqs);
    };
    
    /**
     * WARNING: This is currently very very old code and is mostly
     * here as a bookmark on where to restart.
     * 
     * Trigger a rebuild response {module:bbop-response-barista} on
     * attempting to create a new model with information provided by
     * Capella.
     *
     * If you're attempting to use this, you probably want to revisit
     * everything and everbody first...
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {Object} bootstrap_obj - JSON object ???
     * @param {String} term2aspect - ???
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.capella_bootstrap_model = function(bootstrap_obj, term2aspect){

	var reqs = new request_set(anchor.user_token());

	// Just get a new model going.
	var req = new request('model', 'generate-blank');
	//req.special('db', db_id); // unecessary
	reqs.add(req);

	each(bootstrap_obj, function(ob){

	    // Now, for each of these, we are going to be adding
	    // stuff to MF instances. If there is no MF coming
	    // in, we are just going to use GO:0003674.
	    var mfs = [];
	    var bps = [];
	    var ccs = [];
	    each(ob['terms'], function(tid){
		if( term2aspect[tid] === 'molecular_function' ){
		    mfs.push(tid);
		}else if( term2aspect[tid] === 'biological_process' ){
		    bps.push(tid);
		}else if( term2aspect[tid] === 'cellular_component' ){
		    ccs.push(tid);
		}
	    });
	    // There must be this no matter what.
	    if( us.isEmpty(mfs) ){
 		mfs.push('GO:0003674');
	    }

	    // We are going to be creating instances off of the
	    // MFs.
	    each(mfs, function(mf){
		var req = new request('individual', 'add');
			  
		// Add in the occurs_in from CC.
		each(ccs, function(cc){
		    req.add_svf_expression(cc, 'occurs_in');
		});

		// Add in the enabled_by from entities.
		each(ob['entities'], function(ent){
		    req.add_svf_expression(ent, 'RO:0002333');
		});
	    });
	});

	// Final send-off.
	return anchor.request_with(reqs);
    };
    
    /**
     * Trigger a rebuild response {module:bbop-response-barista} on
     * attempting to create a new model with information provided by
     * a seed service.
     *
     * This code will 
     *
     * Intent: "action".
     * Expect: "success" and "rebuild".
     * 
     * @param {String} process_id - the GOlr resolvable process identifier
     * @param {String} taxon_id - the GOlr resolvable taxon identifier
     * @returns {module:bbop-barista-response#response} barista response
     */
    anchor.seed_from_process = function(process_id, taxon_id){

	var reqs = new request_set(anchor.user_token());

	// Just get a new model going.
	var req = new request('model', 'seed-from-process');
	req.special('process', process_id);
	req.special('taxon', taxon_id);

	reqs.add(req);

	// Final send-off.
	return anchor.request_with(reqs);
    };
    
    /**
     * Make a custom request with your own request set.
     *
     * Depending on the mode that you set, in addition to running the
     * callbacks as usual, it will either return a response object
     * ("sync") or a deferred promise for the response object ("async").
     *
     * Intent: ??? - whatever you set
     * Expect: "success" and ??? (depends on your request)
     * 
     * @param {module:minerva-requests#request_set} request_set
     * @param {String} [model_id] - string
     * @returns {Object} the deferred Q promise for the eventual response
     */
    anchor.request_with = function(request_set, model_id){

	// For this manager, globally at the reasoner flag to outgoing
	// requests if set.
	if( anchor._use_reasoner_p ){
	    request_set.use_reasoner(true);
	}else{
	    request_set.use_reasoner(false);
	}

	// For this manager, groups to be applied are a global
	// property of the request set, similar to the token and/or
	// the injected uid.
	if( anchor.use_groups() && ! us.isEmpty(anchor.use_groups()) ){
	    request_set.use_groups(anchor.use_groups());
	}

	// Assembly. Using callable() here seems to cause double
	// encoding, so we're doing it a little more manually.
	//var args = request_set.callable();
	var args = request_set.structure();
	//console.log('_args', args);
	// Fix requests. Why? Likely see note just below.
	var reqs = args['requests'];
	var str = JSON.stringify(reqs);
	//var enc = encodeURIComponent(str);
	args['requests'] = str;

	// BUG/NOTE/WARNING: While the node engine seems fine with
	// taking objects and arrays when making requests without
	// serializing them (or at least serializing them properly),
	// it seems that jQuery is not so forgiving--it seems to be
	// some kind of serializing bug where the "[" and "]" for the
	// list appear in the wrong spot, destroying the request as
	// intended (this bad input can be seen as it is fine when it
	// leaves the manager, transforms inside jQuery, and bad when
	// it gets to barista). In our case, since groups
	// (provided-by) is an array, we would need to encode it to
	// make sure is survives the trip to the browser (as above);
	// however, for the time being, Minerva cannot decode that
	// string (expecting json object as-is), so we are
	// blocked. Needless to say, this was causing some really
	// weird bugs. Would a jQuery upgrade help here?
	// 
	// https://github.com/berkeleybop/bbop-manager-minerva/issues/1
    // 
    // As a temporary workaround, we are just going to take the
	// first provided-by argument as pass it through.
	if( args['provided-by'] && us.isArray(args['provided-by']) ){
	    if( args['provided-by'].length === 0 ){
		delete args['provided-by'];
	    }else{
		args['provided-by'] = args['provided-by'][0];
	    }
	}
	
	//console.log('_batch_url', anchor._batch_url);
	//console.log('_request_set', request_set);
	//console.log('_args', args);

	// Take care of prerun now (postrun handled elsewhere).
    	anchor.apply_callbacks('prerun', [anchor]);

	// Get what ever output and move on. We'll need to switch on
	// whatever our target URL is.
	var thing = null;
	// Check if known seeding, then direct to known seeding service.
	var rs = request_set.structure();
	if( rs && rs['requests'] && rs['requests'][0] &&
	    rs['requests'][0]['operation'] &&
	    rs['requests'][0]['operation'] === 'seed-from-process' ){
		// seed
		//console.log('running to seeder');
		thing = anchor._runner(anchor._seed_url, args);
	    }else{
		// batch
		thing = anchor._runner(anchor._batch_url, args);
	    }
	
	return thing;
    };    




    /**
     * 
     * @param {*} src_individual 
     * @param {*} map_ind used to derive the target_individual (and other annotated individuals)
     * @param {*} target_model_id 
     */
    anchor.async_copy_individual_annotations = function(src_individual, map_ind, target_model_id) {
        var target_individual = map_ind[src_individual.id];
        if(!target_individual) {
            console.error("Could not find target individual of source: ", src_individual , " in " , map_ind);
            return null;
        }

        var reqs = new request_set(anchor.user_token(), target_model_id);
        for(var i in src_individual.annotations) {
            var annotation = src_individual.annotations[i];
            // I could need to do that AFTER I have added all individuals
            var annotation_value = annotation.value.startsWith("gomodel") ? map_ind[annotation.value] : annotation.value;
            var val_type = annotation['value-type'] ? annotation['value-type'] : null;
            reqs.add_annotation_to_individual(annotation.key, annotation_value, val_type, target_individual);
        }
        return anchor.request_with(reqs);
    };


    anchor.async_copy_model_annotations = function(src_model, target_model_id, new_model_title) {
        var qps = [];
        var annotations = src_model.annotations();
        for(var i in annotations) {
            var annotation = annotations[i];
            var qp = null;
            if(annotation.key == "title") {
                qp = anchor.add_model_annotation(target_model_id, annotation.key, new_model_title, null);
            } else if(annotation.key == "http://www.geneontology.org/formats/oboInOwl#id") {
                qp = anchor.add_model_annotation(target_model_id, "http://www.geneontology.org/formats/oboInOwl#id", target_model_id, null);
            } else if(annotation.key == "state") {
                // do nothing as default model already has a development state
            } else {
                qp = anchor.add_model_annotation(target_model_id, annotation.key, annotation.value, null);
            }
            if(qp) {
                qps.push(qp);
            }
        }
        return Promise.all(qps);
    }    

    anchor.async_copy_model_individuals = function(src_model, target_model_id) {
        var qps = [];
        // SEQUENTIAL / SLOW copy of individuals that keeps a map(src_ind -> target_ind)
        var individuals = src_model.individuals();
        for (var i in individuals) {
            var ind = individuals[i];
            reqs = new request_set(anchor.user_token(), target_model_id);
            reqs.add_individual(ind.type[0].id);
            var resp = anchor.request_with(reqs);
            qps.push(resp);
        }
        return Promise.all(qps);
    }

    anchor.async_copy_individuals_annotations = function(src_model, map_ind, target_model_id) {
        var individuals = src_model.individuals();
        var qps = [];
        for (var i in individuals) {
            var ind = individuals[i];
            var qp = anchor.async_copy_individual_annotations(ind, map_ind, target_model_id);
            qps.push(qp);
        }
        return Promise.all(qps);        
    };    

    anchor.async_copy_model_facts = function(facts, map_ind, target_model_id) {
        var qps = [];
        for(var i in facts) {
            var fact = facts[i];
            var reqs = new request_set(anchor.user_token(), target_model_id);
            reqs.add_fact([map_ind[fact.subject], map_ind[fact.object], fact.property]);

            for(var i in fact.annotations) {
                var annotation = fact.annotations[i];
                var annotation_value = annotation.value.startsWith("gomodel") ? map_ind[annotation.value] : annotation.value;
                var val_type = annotation['value-type'] ? annotation['value-type'] : null;
                // console.log("-> " , [map_ind[fact.subject], map_ind[fact.object], fact.property] , "\t" , annotation.key , val_type , annotation_value)
                reqs.add_annotation_to_fact(annotation.key, annotation_value, val_type,
				    [map_ind[fact.subject], map_ind[fact.object], fact.property]);
            }            
            var qp = anchor.request_with(reqs);
            qps.push(qp);
        }
        return Promise.all(qps);
    };

    anchor.async_duplicate_model = function(src_model_id, new_model_title) {
        console.log("asked to duplicate: ", src_model_id);
        var promise = new Promise(function(resolve, reject) {

            var src_model = null;
            var target_model = null;
            var target_model_id;

            var src_individuals;
            var map_ind = { };

            // getting the source model
            var reqs = new request_set(anchor.user_token(), src_model_id);
            reqs.get_model();
            var get_model_promise = anchor.request_with(reqs);

            // create the target model (empty container at this point)
            var create_model_promise = get_model_promise.then(function(value) {
                src_model = value;
                src_individuals = src_model.individuals();
                console.log("step 1: source_model retrieved", src_model);
                reqs = new request_set(anchor.user_token());
                reqs.add_model();
                return anchor.request_with(reqs);
            });

            // copying annotations of the source model
            var copy_model_annotations_promise = create_model_promise.then(function(value) {
                target_model = value;
                target_model_id = target_model.model_id();
                console.log("step 2: target_model created", target_model);
                return anchor.async_copy_model_annotations(src_model, target_model_id, new_model_title);
            });

            // creating individual containers in the target model
            var copy_model_individuals_promise = copy_model_annotations_promise.then(function() {
                console.log("step 3: src_model annotations copied");
                return anchor.async_copy_model_individuals(src_model, target_model_id);
            });

            // copying the annotations for each individual of the source model to the target model
            var copy_individual_annotations_promise = copy_model_individuals_promise.then(function(dup_individuals) {
                console.log("step 3: target individuals created " , dup_individuals);
                map_ind = { };
                for(var i in dup_individuals) {
                    map_ind[src_individuals[i].id] = dup_individuals[i].individuals()[0].id;
                }
                console.log("with mapping: ", map_ind);
                return anchor.async_copy_individuals_annotations(src_model, map_ind, target_model_id);
            });

            // copying the facts of the source model
            var copy_model_facts_promise = copy_individual_annotations_promise.then(function() {
                console.log("step 4: source individual annotations copied");
                return anchor.async_copy_model_facts(src_model.facts(), map_ind, target_model_id);
            });
            
            // storing the model in the triple store
            copy_model_facts_promise.then(function() {
                console.log("step 5: model facts copied");
                // finally, storing model
                anchor.store_model(target_model_id).then(function(val) {
                    console.log("target model saved: ", val);
                    resolve(val);
                }, function(reason) {
                    reject(reason);
                });
            });

        });            
        return promise;
    }    

};
bbop.extend(manager, registry);

///
/// Exportable body.
///

module.exports = manager;
