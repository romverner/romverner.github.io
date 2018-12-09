$(document).ready(function(){
    game.buttonMaker('Start', 'start', 'btn btn-primary');
    $("#start").on("click", game.run);
});

var intervalId;

var game = {

    timeRemain: 20,
    answered: false,
    nextSwitch: false,
    gameSwitch: false,
    questionCount: 0,
    correct: 0,
    incorrect: 0,
    unAnswered: 0,

    questionsAnswers: [{
        question: "What was the frozen yogurt from season one actually made of?",
        options: ['Mashed Potatoes','Batter','Ice Cream','It really was frozen yogurt.'],
        correctAnswer: 0
    }, {
        question: "For this actor/actress, 'The Good Place' is their first role in a series or film.",
        options: ['Kristen Bell','William Harper','Jameela Jamil', "D'Arcy Carden"],
        correctAnswer: 2
    }, {
        question: "Tahani's first name is of Arabic origin, what does the name mean?",
        options: ['congratulations', 'beautiful', 'eclipse', 'best wishes'],
        correctAnswer: 1
    }, {
        question: "The pilot episode attracted how many viewers?",
        options: ['1.8 million', '12.11 million', '4.7 million', '8.04 million'],
        correctAnswer: 3
    }, {
        question: "Who was originally considered for the role of Shawn?",
        options: ['Nick Offerman', 'Hugo Weaving', 'Brendan Fraser', 'Woody Harrelson'],
        correctAnswer: 0
    }],

    run: function() {
        clearInterval(intervalId);
        if (game.questionCount === 0) {
            game.timerDisplay();
            game.hideStart();
            game.questionFill();
            game.answerFill();
            intervalId = setInterval(game.play, 1000);
        };
        if (game.nextSwitch === true) {
            game.buttonMaker('Next', 'next', 'next btn btn-primary');
            game.nextSwitch = false;
        };
        $(".next").on("click", game.nextQuestion);
        $(".restart").on("click", game.restartGame);
    },

    continueRun: function() {
        clearInterval(intervalId);
        intervalId = setInterval(game.play, 1000);
    },

    play: function() {
        game.timeRemain--;
        game.timerDisplay();
        
        if (game.timeRemain === 0) {
            game.timeOut();
        };

        if (game.questionCount === 5) {
            game.gameOver();
            game.stop();
        };

        $(".answers").on("click", game.answerCheck);
    },

    stop: function() {
        clearInterval(intervalId);
    },

    // All functions besides run/play/stop will be below here

    answerCheck: function() {
        game.stop();
        var localValue = $(this).attr('value');
        console.log(localValue);

        if (localValue == game.questionsAnswers[game.questionCount].correctAnswer && game.answered === false) {
            game.correct++;
            game.questionCount++;
            console.log("Correct");
            game.answered = true;

            if (game.questionCount == 5) {
                game.gameOver();
            }

            else {
                game.correctMessage();
                game.nextSwitch = true;
            };            
        }
        else if (localValue !== game.questionsAnswers[game.questionCount].correctAnswer && game.answered === false) {
            game.incorrectMessage();
            game.incorrect++;
            game.questionCount++;

            if (game.questionCount == 5) {
                game.gameOver();
            };

            console.log("Incorrect");
            game.answered = true;
            game.nextSwitch = true;
        };
        game.run();
    },

    correctMessage: function() {
        $("#sp-1, #sp-2, #sp-3").empty();
        $("#sp-1").html("<h5>Correct!</h5>");
        $("#sp-2").html("<br><img src='https://media2.giphy.com/media/l3mZnyUWFRyEjibWE/giphy.gif?cid=3640f6095c0c4c36692f77376fc8ab52' class='img-fluid rounded' alt='janet funny'>");
    },

    incorrectMessage: function() {
        $("#sp-1, #sp-2, #sp-3").empty();
        $("#sp-1").html("<h5>Incorrect!</h5>");
        $("#sp-2").html("<h5>The correct answer was:</h5>");
        $("#sp-3").html("<h5>" + game.questionsAnswers[game.questionCount].options[game.questionsAnswers[game.questionCount].correctAnswer] + "</h5>");
        $("#sp-3").append("<br><img src='https://media0.giphy.com/media/1wXeOYCLeYm0YrYP3N/giphy.gif?cid=3640f6095c0c4cb66a654478457b78df' class='img-fluid rounded mb-3'alt='shake head'>");
    },
    
    timerDisplay: function() {
        $("#sp-1").html("<h5>Time remaining: " + game.timeRemain + " seconds</h5>");
    },

    buttonMaker: function(desiredText, desiredId, desiredClass, numberValue) {
        var buttonMade = $('<button>');
        buttonMade.text(desiredText);
        buttonMade.attr('value', numberValue);
        buttonMade.attr('id', desiredId);
        buttonMade.attr('class', desiredClass);
        $("#sp-3").append(buttonMade);
        $("#sp-3").append("<br>");
    },

    questionFill: function() {
        $("#sp-2").empty();
        $("#sp-2").html("<h5>" + game.questionsAnswers[game.questionCount].question + "</h5><br>");
    },

    answerFill: function() {
        $("#sp-3").empty();
        for (i = 0; i < 4; i++) {
            game.buttonMaker(game.questionsAnswers[game.questionCount].options[i], 'answers', 'btn btn-primary answers mt-3', i);
        };
    },

    nextQuestion: function() {
        game.timeRemain = 20;
        game.answered = false;
        game.nextSwitch = false;
        game.questionFill();
        game.answerFill();
        game.continueRun();
    },

    hideStart: function() {
        $("#start").hide();
    },

    timeOut: function() {
        game.stop();
        $("#sp-2, #sp-3").empty();
        $("#sp-2").html("<h5>Timed out. The correct answer was:</h5>");
        $("#sp-3").html("<h5>" + game.questionsAnswers[game.questionCount].options[game.questionsAnswers[game.questionCount].correctAnswer] + "</h5>");
        $("#sp-3").append("<img src='https://media1.giphy.com/media/3oxHQBUlter159YC2s/giphy.gif?cid=3640f6095c0c4c6a4e42684441f3cadf' class='img-fluid rounded mb-3' alt='janet button'><br>")
        game.questionCount++;
        game.unAnswered++;
        game.nextSwitch = true;
        game.run();
    },

    gameOver: function() {
        game.stop();
        
        $("#sp-1, #sp-2, #sp-3").empty();
        $("#sp-1").text("Game over! Here are your results!");
        $("#sp-2").text("Here are your results!");
        $("#sp-3").html("<p></p>");

        var correctResult = "Correct: " + game.correct + "<br>";
        var incorrectResult = "Incorrect: " + game.incorrect + "<br>";
        var missedResult = "Unanswered: " + game.unAnswered;
        $("#sp-3").append(correctResult + incorrectResult + missedResult);
        $("#sp-3").append("<br>Try again?<br>");
        
        var restartButton = game.buttonMaker('Restart', 'restart', 'restart btn btn-primary mt-3');
        $("#sp-3").append(restartButton);

        game.gameSwitch = true;
        game.run();
    },

    restartGame: function() {
        game.timeRemain = 20;
        game.answered = false;
        game.nextSwitch = false;
        game.questionCount = 0;
        game.correct = 0;
        game.incorrect = 0;
        game.unAnswered = 0;

        game.run();
    }
};

