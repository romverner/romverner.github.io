$(document).ready(function() {
    // Global variables
    var userNumber = 0;
    var userTotal = 0;
    var winCount = 0;
    var lossCount = 0;
    var startGame = true;
    
    // Random number generator, set lower and upper limits
    function randomNumber(lower, upper) {
        var number = Math.floor((Math.random() * upper) + lower);
        return number;
    };

    // Resets total and displays latest numbers
    function resetGame() {
        userTotal = 0;

        $("#random-number").text(userNumber);
        $("#current-total").text(userTotal);
        $("#crystal-value").text($(this).attr("data-crystalvalue"));
        $("#loss-count").text(lossCount);
        $("#win-count").text(winCount);
    }

    // Adds random numbers as attributes to crystal buttons
    function attributeSet() {
        $("#crystal-1").attr("data-crystalvalue", randomNumber(1, 12));
        $("#crystal-2").attr("data-crystalvalue", randomNumber(1, 12));
        $("#crystal-3").attr("data-crystalvalue", randomNumber(1, 12));
        $("#crystal-4").attr("data-crystalvalue", randomNumber(1, 12));
    };

    // Looks for click events on any crystal button
    $(".btn").on("click", function() {
        if (startGame === false) {
            var crystalValue = ($(this).attr("data-crystalvalue"));
            crystalValue = parseInt(crystalValue);
            userTotal += crystalValue;
            $("#current-total").text(userTotal);
            $("#crystal-value").text($(this).attr("data-crystalvalue"));

            if (userTotal > userNumber) {
                userNumber = randomNumber(12, 120);
                attributeSet();

                lossCount += 1;
                alert("You lost. Try again!")
                resetGame();
            }

            else if (userTotal === userNumber) {
                userNumber = randomNumber(12, 120);
                attributeSet();

                winCount += 1;
                alert("You won!");
                resetGame();
            }
        }
        
        else if (startGame === true) {
            userNumber = randomNumber(19, 120);
            attributeSet();

            $("#random-number").text(userNumber);
            $("#current-total").text(userTotal);
            $("#crystal-value").text($(this).attr("data-crystalvalue"));

            startGame = false;
        };
    });
});