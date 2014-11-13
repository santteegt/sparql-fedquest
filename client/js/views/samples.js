/*
    View logic for the dashboard component
 */
this.SamplesView = Backbone.View.extend({
  tagName: "div",
  id: "samples",

  /////////////////////////
  // View Initialization //
  /////////////////////////
  initialize: function() {
    var me;
    me = this;
    Tracker.autorun(function(){
      //var endpoints = Endpoints.find({status: 'A'},{fields:{endpoint: 1, graphURI: 1}}).fetch();
      var queries = Queries.find().fetch();
      if(queries.length > 0) {
        Session.set('queries', queries);  
      }
      console.log("Queries Disponibles: " + queries.length);
    });

  },

  //////////////////////////
  //Render Samples Views//
  //////////////////////////
  render: function() {
    Blaze.render(Template.samples, $('#sparql-content')[0]);
    return this;
  }
});