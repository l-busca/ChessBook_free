// app.js

// Variables globales
let lines = [];
let usedLines = new Set();
let totalDrills = 0;
let successfulDrills = 0;
let board;
let currentLine;
let currentLineIndex = 0;
let boardOrientation = 'white';
let playerColor = 'white';

// Gestion des événements
document.getElementById('pgnFileInput').addEventListener('change', handleFileSelect, false);
document.getElementById('startDrill').addEventListener('click', startDrill, false);
document.getElementById('flipBoard').addEventListener('click', flipBoard, false);
document.getElementById('showSolution').addEventListener('click', showSolution, false);

function handleFileSelect(event) {
    const files = event.target.files;
    let fileIndex = 0;

    function readNextFile() {
        if (fileIndex >= files.length) {
            displayMessage('Tous les fichiers ont été chargés.', true);
            return;
        }

        const reader = new FileReader();
        const file = files[fileIndex];

        reader.onload = function(e) {
            const content = e.target.result;
            parsePGN(content);
            fileIndex++;
            readNextFile();
        };

        reader.readAsText(file);
    }

    readNextFile();
}

function parsePGN(pgnText) {
    console.log('PgnParser:', PgnParser);

    const parsedGames = PgnParser.parse(pgnText, { startRule: 'games' });

    lines = []; // Réinitialiser les lignes pour chaque nouveau fichier chargé
    parsedGames.forEach(gameData => {
        const game = new Chess();
        extractLinesFromMoves(gameData.moves, [], game);
    });

    if (lines.length > 0) {
        displayMessage(`${lines.length} scénarios ont été extraits avec succès.`, true);

        // Afficher tous les scénarios pour le débogage
        const scenarioList = document.getElementById('scenarioList');
        scenarioList.innerHTML = '';
        lines.forEach((line, index) => {
            const lineElement = document.createElement('div');
            lineElement.textContent = `Scénario ${index + 1}: ${line.join(' ')}`;
            scenarioList.appendChild(lineElement);
        });
    } else {
        displayMessage('Aucun scénario valide n\'a été extrait. Veuillez vérifier le format de vos fichiers PGN.', false);
    }
}

function extractLinesFromMoves(moves, currentLine, game) {
    if (!moves || moves.length === 0) {
        if (currentLine.length > 0) {
            // Ajouter une copie du currentLine pour éviter les références partagées
            lines.push([...currentLine]);
        }
        return;
    }

    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const moveSan = move.notation.notation;

        // Essayer d'effectuer le mouvement
        const result = game.move(moveSan, { sloppy: true });
        if (result === null) {
            console.error('Mouvement invalide:', moveSan);
            game.undo();
            continue;
        }

        currentLine.push(moveSan);

        // Traiter les variations à ce niveau
        if (move.variations && move.variations.length > 0) {
            for (const variation of move.variations) {
                const variationGame = new Chess(game.fen());
                extractLinesFromMoves(variation, [...currentLine], variationGame);
            }
        }

        // Continuer avec la ligne principale
        extractLinesFromMoves(move.moves, currentLine, game);

        // Annuler le mouvement et retirer le coup de la ligne actuelle
        game.undo();
        currentLine.pop();
    }
}

function validateLine(line) {
    const game = new Chess();
    for (let move of line) {
        const result = game.move(move, { sloppy: true });
        if (result === null) {
            return false; // Mouvement invalide
        }
    }
    return true;
}

function startDrill() {
    if (lines.size === 0) {
        displayMessage('Veuillez charger des fichiers PGN avant de commencer.', false);
        return;
    }
    usedLines.clear();
    totalDrills = 0;
    successfulDrills = 0;
    updateProgress();

    const playerColorSelect = document.getElementById('playerColor');
    playerColor = playerColorSelect.value;
    boardOrientation = playerColor;

    nextLine();
}

function nextLine() {
    const linesArray = Array.from(lines);
    if (usedLines.size >= linesArray.length) {
        displayMessage('Vous avez terminé tous les scénarios disponibles pour cette session.', true);
        return;
    }

    let availableLines = linesArray.filter((lineStr, index) => !usedLines.has(index));
    let randomIndex = Math.floor(Math.random() * availableLines.length);
    let lineIndex = linesArray.indexOf(availableLines[randomIndex]);
    usedLines.add(lineIndex);
    currentLine = availableLines[randomIndex].split(' ');
    currentLineIndex = 0;

    document.getElementById('currentLine').innerText = 'Scénario : ' + currentLine.join(' ');

    loadPosition();
}

function loadPosition() {
    if (board) {
        board.destroy();
    }

    const fen = getFenFromMoves(currentLine.slice(0, currentLineIndex));

    board = Chessboard('board', {
        position: fen,
        draggable: true,
        onDrop: onDrop,
        orientation: boardOrientation,
        pieceTheme: 'img/chesspieces/wikipedia/{piece}.png'
    });

    displayMessage('', false);

    if (getCurrentTurn() !== playerColor[0]) {
        setTimeout(makeOpponentMove, 500);
    }
}

function getCurrentTurn() {
    const game = new Chess(getFenFromMoves(currentLine.slice(0, currentLineIndex)));
    return game.turn(); // 'w' ou 'b'
}

function getFenFromMoves(moves) {
    const game = new Chess();
    for (let move of moves) {
        const result = game.move(move, { sloppy: true });
        if (result === null) {
            console.error('Coup invalide dans getFenFromMoves:', move);
            break;
        }
    }
    return game.fen();
}

function makeOpponentMove() {
    const game = new Chess(getFenFromMoves(currentLine.slice(0, currentLineIndex)));
    const opponentMoveSan = currentLine[currentLineIndex];
    const move = game.move(opponentMoveSan, { sloppy: true });
    if (move !== null) {
        board.position(game.fen(), true);
        currentLineIndex++;
        if (getCurrentTurn() !== playerColor[0]) {
            setTimeout(makeOpponentMove, 500);
        }
    } else {
        console.error('Coup de l\'adversaire invalide:', opponentMoveSan);
    }
}

function onDrop(source, target, piece, newPos, oldPos, orientation) {
    const game = new Chess(getFenFromMoves(currentLine.slice(0, currentLineIndex)));
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (move === null) {
        return 'snapback';
    } else {
        const correctMoveSan = currentLine[currentLineIndex];
        const correctGame = new Chess(getFenFromMoves(currentLine.slice(0, currentLineIndex)));
        const correctMove = correctGame.move(correctMoveSan, { sloppy: true });

        if (correctMove === null) {
            displayMessage('Le coup correct n\'est pas valide pour cette position.', false);
            console.error('Coup correct invalide:', correctMoveSan);
            return 'snapback';
        }

        if (move.san === correctMove.san || (move.from === correctMove.from && move.to === correctMove.to)) {
            currentLineIndex++;
            if (currentLineIndex >= currentLine.length) {
                successfulDrills++;
                totalDrills++;
                updateProgress();
                displayMessage('Bon travail ! Vous avez terminé ce scénario.', true);
                setTimeout(nextLine, 1000);
            } else {
                if (getCurrentTurn() !== playerColor[0]) {
                    setTimeout(makeOpponentMove, 500);
                }
            }
        } else {
            totalDrills++;
            updateProgress();
            displayMessage(`Coup incorrect. Le coup correct était : ${correctMoveSan}`, false);
            return 'snapback';
        }
    }
}

function flipBoard() {
    boardOrientation = boardOrientation === 'white' ? 'black' : 'white';
    board.flip();
}

function showSolution() {
    if (!currentLine) {
        displayMessage('Aucun scénario en cours.', false);
        return;
    }

    const remainingMoves = currentLine.slice(currentLineIndex);
    if (remainingMoves.length === 0) {
        displayMessage('Pas de solution disponible pour cette position.', false);
        return;
    }

    const game = new Chess(getFenFromMoves(currentLine.slice(0, currentLineIndex)));
    for (let moveSan of remainingMoves) {
        game.move(moveSan, { sloppy: true });
    }

    board.position(game.fen(), true);
    displayMessage('Solution affichée.', true);

    setTimeout(nextLine, 2000);
}

function updateProgress() {
    const percentage = totalDrills > 0 ? Math.round((successfulDrills / totalDrills) * 100) : 0;
    document.getElementById('progress').innerText = `Progression : ${successfulDrills}/${totalDrills} (${percentage}%)`;
}

function displayMessage(message, isSuccess) {
    const messageDiv = document.getElementById('message');
    messageDiv.innerText = message;
    if (isSuccess) {
        messageDiv.classList.remove('message-error');
        messageDiv.classList.add('message-success');
    } else {
        messageDiv.classList.remove('message-success');
        messageDiv.classList.add('message-error');
    }
}
