

var startDate = '2017-04-01';
var endDate = ee.Date('2022-07-01');
var areaPerPixel = ee.Image.pixelArea();

var dw = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterDate(startDate, endDate);

var step = 3;

var water_value_in_original_dataset = 6;

var label_band_name = "SCL";

var nMonths = ee.Number(endDate.difference(ee.Date(startDate), 'month')).subtract(1).round();

function generate_collection(geometry, target_index) {

  var byMonth = ee.ImageCollection(
    ee.List.sequence(0, nMonths, step).map(function (n) {
      
      var ini = ee.Date(startDate).advance(n, 'month');
      var end = ini.advance(step, 'month');
    
      var period_available = dw.filterDate(ini, end)
      .filterBounds(geometry)
      .select(label_band_name);
      
      var image = ee.Algorithms.If(period_available.size().gt(0), 
      period_available.reduce(ee.Reducer.mode()).eq(target_index).selfMask().multiply(areaPerPixel).divide(1e6).set('system:time_start', ini),
      ee.Image().addBands(-1).rename(["label_mode", "constant"]).select("label_mode").eq(water_value_in_original_dataset).selfMask().set('system:time_start', ini))

      return image
    })
  );

  return byMonth;
}


function generate_chart(byMonth, geometry, target) {
  var chart = ui.Chart.image.series({
    imageCollection: byMonth.map(function (image) { return image.rename([target]) }),
    region: geometry,
    scale: 100,
    reducer: ee.Reducer.sum(),

  }).setOptions({
    vAxis: { title: target + ' area over time' }
  })
  return chart;
}






function generate_thumbnails(byMonth, geometry) {

  var args = {
    crs: 'EPSG:4326',
    dimensions: '500',
    region: geometry,
    framesPerSecond: 1
  };

  var text = require('users/gena/packages:text'); // Import gena's package which allows text overlay on image

  var annotations = [
    { position: 'left', offset: '1%', margin: '1%', property: 'label', scale: Map.getScale() * 2 }
  ];

  function addText(image) {

    var timeStamp = ee.Date(image.get('system:time_start')).format().slice(0, 7); // get the time stamp of each frame. This can be any string. Date, Years, Hours, etc.
    timeStamp = ee.String(timeStamp); //convert time stamp to string 

    image = image.visualize({ //convert each frame to RGB image explicitly since it is a 1 band image
      forceRgbOutput: true,
      min: 0,
      max: 1,
      palette: ['steelblue', 'white']
    }).set({ 'label': timeStamp }); // set a property called label for each image

    var annotated = text.annotateImage(image, {}, geometry, annotations); // create a new image with the label overlayed using gena's package

    return annotated;
  }

  var collection = byMonth.map(addText) //add time stamp to all images

  return ui.Thumbnail(collection, args);

}



function control () {
  //define the left panel with some info and add it to the ui
  var panel = ui.Panel({
    style: { width: '400px' }
  })
    .add(ui.Label("Use drawing tool to define a region."))
    .add(ui.Label("Select a land use type in the drop down menu."))
  ui.root.add(panel);
  
  var targets = ['Saturated or defective', 'Dark Area Pixels', 'Cloud Shadows', 'Vegetation', 'Bare Soils', 'Water', 'Clouds Low Probability / Unclassified', 'Clouds Medium Probability', 'Clouds High Probability', 'Cirrus', 'Snow / Ice'];
  var target_index = 5;
  var target = "Water"
  
  // define the drop down menu and add it to the panel
  var land_use_type = ui.Select({ items: targets, placeholder: target });
  panel.add(land_use_type);

  //define the reset button and add it to the map
  var reset_button = ui.Button({ label: 'Clear drawing', style: { position: 'bottom-left' } });
  var drawingTools = Map.drawingTools();
  
  reset_button.onClick(function () {
    while (drawingTools.layers().length() > 0) {
      var layer = drawingTools.layers().get(0);
      drawingTools.layers().remove(layer);
    }
  });
  
  Map.add(reset_button)
  
  //define chart and thumbnail widgets
  var chart;
  var thumbnails;
  
  //the refresh function centers the map the to selected region
  //removes the old widgets
  //generates a new image collection
  //generates a new line chart
  //and generates a new thumbnail series
  function refresh(geometry, target) {
    Map.centerObject(geometry);
    panel.remove(chart);
    panel.remove(thumbnails);
  
    target_index = targets.indexOf(target);
  
    var byMonth = generate_collection(geometry, target_index);
  
    chart = generate_chart(byMonth, geometry, target);
  
    panel.add(chart);
  
    thumbnails = generate_thumbnails(byMonth, geometry);
  
    panel.add(thumbnails);
  }
  
  //when the user redraw the region, refresh
  Map.drawingTools().onDraw(function (new_geometry) {
    geometry = new_geometry;
    refresh(geometry, target);
  })
  
  //when the user change the land type, refresh
  land_use_type.onChange(function (value) {
  
    target = value;
  
    refresh(geometry, target);
  })
  
}



control();
