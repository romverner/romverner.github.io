// Initialize Firebase
var config = {
    apiKey: "AIzaSyAMIzEXuYHtoHMzOf_aJq5YEwg0xE8Dbhs",
    authDomain: "train-scheduler-f2f39.firebaseapp.com",
    databaseURL: "https://train-scheduler-f2f39.firebaseio.com",
    projectId: "train-scheduler-f2f39",
    storageBucket: "train-scheduler-f2f39.appspot.com",
    messagingSenderId: "658694027922"
};

firebase.initializeApp(config);

var database = firebase.database();

// Global variables
var trainName = "";
var destination = "";
var firstTrain = "";
var frequency = 0;
var rowCounter = 1;

$(document).on("click", "#submit", function(event) {
    event.preventDefault();

    trainName = $("#trainName").val().trim();
    destination = $("#destination").val().trim();
    firstTrain = $("#firstTrain").val().trim();
    frequency = $("#frequency").val().trim();

    database.ref().push({
        trainName: trainName,
        destination: destination,
        firstTrain: firstTrain,
        frequency: frequency,
    });
});

database.ref().on("child_added", function(snapshot) {

    var minutesAway = function() {
        var localFirstTrain = snapshot.val().firstTrain;
        var localFrequency = snapshot.val().frequency;

        var localFirstTrainArray = localFirstTrain.split(":");
        var localFrequencyObject = moment(localFrequency, "mm");
  
        // Get the time of the day (today) when the train first arrives
        var trainTime = moment().hour(localFirstTrainArray[0]).minutes(localFirstTrainArray[1]);
        
        // get the current time
        var time = moment();
        
        // find the next time the train will arrive after the current time
        while (time.isAfter(trainTime)) {
            trainTime.add(localFrequencyObject);
        };

        // find the number of minutes that the next arrival time after 
        // the current time is
        var minutesAway = -1 * parseInt(moment.duration(
            moment(time).diff(moment(trainTime)))
            .as('minutes'));

        return minutesAway;
    };

    var nextTrain = function() {
        var currentTime = moment().add(minutesAway(), 'minutes').format("HH:mm");
        
        return currentTime;
    };

    var renderTable = function() {
        var table = document.getElementById("traintable");
        var row = table.insertRow(rowCounter);
    
        if (rowCounter % 2 == 0) {
            row.setAttribute('class', 'bg-light');
        };
    
        var cell1 = row.insertCell(0);
        var cell2 = row.insertCell(1);
        var cell3 = row.insertCell(2);
        var cell4 = row.insertCell(3);
        var cell5 = row.insertCell(4);
    
        cell1.innerHTML = snapshot.val().trainName;
        cell2.innerHTML = snapshot.val().destination;
        cell3.innerHTML = snapshot.val().frequency + " minutes";
        cell4.innerHTML = nextTrain();
        cell5.innerHTML = minutesAway();
    
        rowCounter++;
    };

    renderTable();

}, function(errorObject) {
    console.log("Errors handled: " + errorObject.code);
});