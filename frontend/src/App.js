import './App.css';
import React, { useState, useRef } from 'react';
import axios from 'axios';

function App() {

	const [question, setQuestion] = useState('Where do you live?');
	const [answer, setAnswer] = useState('');
	const [isRecording, setIsRecording] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const mediaRecorderRef = useRef(null);
	const audioChunksRef = useRef([]);

	//Question text to speech
	const playQuestion = async () => {

		setAnswer('');
		try {

			const response = await axios.post('http://localhost:5000/api/text-to-speech', { text: question });
			const audioSrc = `data:audio/mp3;base64,${response.data.audioContent}`;
			const audio = new Audio(audioSrc);
			audio.play();

		} catch (error) {

			console.error("Error in text-to-speech API:", error);
		}
	};

	// speech to text
	const toggleRecording = async () => {

		if (!isRecording) {
			setAnswer('');  // Clearing the textbox when a new recording starts

			try {

				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				console.log('Audio stream obtained:', stream);

				const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
				console.log('MediaRecorder initialized:', recorder);

				recorder.ondataavailable = event => {
					console.log('Audio chunk available:', event.data, 'Size:', event.data.size);
					if (event.data.size > 0) {
						audioChunksRef.current.push(event.data);
					}
				};

				recorder.onstart = () => console.log('Recording started.');
				recorder.onstop = () => {
					console.log('Recording stopped.');
					handleAudioData();
				};

				recorder.onerror = event => console.error('MediaRecorder error:', event.error);

				recorder.start();
				mediaRecorderRef.current = recorder;
				setIsRecording(true);
				audioChunksRef.current = [];

			} catch (error) {
				alert("Error starting recording. Please check your microphone permissions.");
			}

		} else {

			mediaRecorderRef.current.stop();
			setIsRecording(false);

		}
	};

	const handleAudioData = async () => {

		if (audioChunksRef.current.length === 0) {
			alert('No audio recorded.');
			return;
		}

		const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
		const reader = new FileReader();
		reader.readAsDataURL(audioBlob);

		reader.onloadend = async () => {

			const base64data = reader.result.split(',')[1];
			setIsProcessing(true);

			try {

				const response = await axios.post('http://localhost:5000/api/speech-to-text', {
					audioContent: base64data,
				});

				setAnswer(response.data.transcript);

			} catch (error) {

				alert("Error in speech recognition. Please try again.");

			} finally {

				setIsProcessing(false);

			}
		};
	};

	const handleClear = () => {

		setAnswer('');

	};

	return (
		<div className="App">

			<header className="App-header">
				<h1>Speech Interaction Website</h1>
			</header>

			<main>
				
				<div className="question-section">
					<h2>Question:</h2>
					<p>{question}</p>
					<button onClick={playQuestion}>Play Question</button>
				</div>

				<div className="recording-section">
					<button onClick={toggleRecording}>
						{isRecording ? 'Stop Recording' : 'Start Recording'}
					</button>
				</div>

				{isProcessing && <div>Processing...</div>}

				<div className="answer-section">
					<h2>Your Answer:</h2>
					{answer}
				</div>

				<br></br>
				<button onClick={handleClear}>Clear</button>

			</main>

		</div>
	);
}

export default App;