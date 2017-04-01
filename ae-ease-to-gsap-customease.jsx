﻿(function () {
	'use strict';

	/**
	 * An SVG path comprised of multiple path drawing commands.
	 * https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths
	 * @param startX {number} - If provided, defines the start point for the initial "move" (M) command.
	 * @param startY {number} - If provided, defines the start point for the initial "move" (M) command.
	 * @constructor
	 */
	function Path(startX, startY) {
		this.commands = [];

		if (typeof startX === 'number' && typeof startY === 'number') {
			var moveCommand = new PathCommand('M', startX, startY);
			this.commands = [moveCommand];
		}
	}

	/**
	 * Inverts the Y axis of all points of all commands in this path.
	 * Used to help get paths into a format that GSAP's CustomEase plugin expects.
	 */
	Path.prototype.invertYAxis = function () {
		var numCommands = this.commands.length;
		for (var i = 0; i < numCommands; i++) {
			var command = this.commands[i];
			var numPoints = command.points.length;

			for (var j = 0; j < numPoints; j++) {
				var point = command.points[j];
				point.y *= -1;
			}
		}
	};

	/**
	 * Returns the end point of the path.
	 * @returns {Point}
	 */
	Path.prototype.getEndPoint = function () {
		var numCommands = this.commands.length;
		var lastCommand = this.commands[numCommands - 1];
		var numPoints = lastCommand.points.length;
		return lastCommand.points[numPoints - 1];
	};

	Path.prototype.toString = function () {
		var string = '';
		for (var i = 0; i < this.commands.length; i++) {
			string += this.commands[i].toString();
		}
		return string;
	};

	/**
	 * A single SVG path command.
	 * https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths
	 * @param command {string} - A single-character SVG path command, see above MDN link for more details.
	 * @constructor
	 */
	function PathCommand(command) {
		this.command = command;
		this.points = [];

		var coordinates = Array.prototype.slice.call(arguments, 1);
		var hasEvenNumberOfCoordinates = !(coordinates.length % 2);
		if (hasEvenNumberOfCoordinates) {
			for (var i = 0; i < coordinates.length; i += 2) {
				var point = new Point(coordinates[i], coordinates[i + 1]);
				this.points.push(point);
			}
		} else {
			throw new Error('Must provide an even number of coordinates when instantiating a PathCommand.');
		}
	}

	PathCommand.prototype.toString = function () {
		var string = this.command;
		for (var i = 0; i < this.points.length; i++) {
			if (i >= 1) {
				string += ',';
			}

			string += this.points[i].toString();
		}
		return string;
	};

	/**
	 * A 2D point in space.
	 * @param x {number}
	 * @param y {number}
	 * @constructor
	 */
	function Point(x, y) {
		this.x = x;
		this.y = y;
	}

	Point.prototype.toString = function () {
		return cleanNumber(this.x) + ',' + cleanNumber(this.y);
	};

	// Above this line are the class definitions used in the script.
	/* ---------------------------------------------------------------------------- */
	// Below this line is the main logic of the script.

	var curItem = app.project.activeItem;
	var framerate = curItem.frameRate;
	var selectedLayers = curItem.selectedLayers;
	var selectedProperties = curItem.selectedProperties;

	if (selectedLayers.length === 0) {
		alert('Please Select at least one Layer');
		return;
	}

	if (selectedProperties.length === 0) {
		alert('Please Select at least one Property (Scale, Opacity, etc)');
		return;
	}

	for (var i = 0; i < selectedLayers.length; i++) {
		for (var f in selectedProperties) {
			if (!{}.hasOwnProperty.call(selectedProperties, f)) {
				continue;
			}

			var currentProperty = selectedProperties[f];
			if (currentProperty.numKeys <= 1) {
				continue;
			}

			var curveStartFrame = currentProperty.keyTime(1) * framerate;
			var curveStartValue;

			if (currentProperty.value instanceof Array) {
				curveStartValue = currentProperty.keyValue(1)[0];
			} else {
				curveStartValue = currentProperty.keyValue(1);
			}

			// The path data we output is in SVG path format: https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths
			// Moves the drawing pen to the start point of the path.
			var path = new Path(curveStartFrame, curveStartValue);

			for (i = 1; i < currentProperty.numKeys; i++) {
				var command;
				var tweenData = calcTweenData(currentProperty, i, i + 1);
				var easeType = calcEaseType(currentProperty, i, i + 1);
				$.writeln('easeType: ' + easeType);

				// For linear eases, just draw a line. (L x y)
				if (easeType === 'linear-linear') {
					command = new PathCommand('L', tweenData.endFrame, tweenData.endValue);
					path.commands.push(command);
					continue;
				}

				if (easeType === 'unsupported') {
					$.writeln('UNSUPPORTED EASING PAIR!');
					alert('This keyframe pair uses an unsupported pair of ease types, results may be inaccurate.');
				}

				command = new PathCommand('C');
				command.points.push(
					calcOutgoingControlPoint(tweenData, currentProperty, i),
					calcIncomingControlPoint(tweenData, currentProperty, i),
					new Point(tweenData.endFrame, tweenData.endValue) // End anchor point.
				);
				path.commands.push(command);

				$.writeln();
			}

			var endPoint = path.getEndPoint();
			if (endPoint.y > curveStartValue) {
				path.invertYAxis();
			}

			var pathString = path.toString();
			$.writeln(pathString);
			$.writeln();
			$.writeln();
			copyTextToClipboard(pathString);
			alert('Copied to clipboard:\n' + pathString +
				'\n\nPaste directly into a GSAP CustomEase, like:\n' +
				'CustomEase.create(\'myCustomEase\', \'' + pathString + '\');' +
				'\n\nMore info: https://greensock.com/docs/#/HTML5/GSAP/Easing/CustomEase/');
		}
	}

	// Above this line is the main logic of the script.
	/* ---------------------------------------------------------------------------- */
	// Below this line are the helper functions that the main logic uses.

	function calcTweenData(property, startIndex, endIndex) {
		var startTime = property.keyTime(startIndex);
		var endTime = property.keyTime(endIndex);
		var durationTime = endTime - startTime;

		var startFrame = startTime * framerate;
		var endFrame = endTime * framerate;
		var durationFrames = endFrame - startFrame;

		var startValue;
		var endValue;

		if (property.value instanceof Array) {
			startValue = property.keyValue(startIndex)[0];
			endValue = property.keyValue(endIndex)[0];
		} else {
			startValue = property.keyValue(startIndex);
			endValue = property.keyValue(endIndex);
		}

		return {
			startTime: startTime,
			endTime: endTime,
			durationTime: durationTime,
			startFrame: startFrame,
			endFrame: endFrame,
			durationFrames: durationFrames,
			startValue: startValue,
			endValue: endValue
		};
	}

	function cleanNumber(num) {
		return parseFloat(num.toFixed(4));
	}

	// From https://forums.adobe.com/message/9157695#9157695
	function copyTextToClipboard(str) {
		var cmdString;
		if ($.os.indexOf('Windows') === -1) {
			cmdString = 'echo "' + str + '" | pbcopy';
		} else {
			cmdString = 'cmd.exe /c cmd.exe /c "echo ' + str + ' | clip"';
		}

		system.callSystem(cmdString);
	}

	function calcEaseType(property, startIndex, endIndex) {
		var startInterpolation = property.keyOutInterpolationType(startIndex);
		var endInterpolation = property.keyInInterpolationType(endIndex);

		if (startInterpolation === KeyframeInterpolationType.LINEAR &&
			endInterpolation === KeyframeInterpolationType.LINEAR) {
			return 'linear-linear';
		}

		if (startInterpolation === KeyframeInterpolationType.LINEAR &&
			endInterpolation === KeyframeInterpolationType.BEZIER) {
			return 'linear-bezier';
		}

		if (startInterpolation === KeyframeInterpolationType.BEZIER &&
			endInterpolation === KeyframeInterpolationType.LINEAR) {
			return 'bezier-linear';
		}

		if (startInterpolation === KeyframeInterpolationType.BEZIER &&
			endInterpolation === KeyframeInterpolationType.BEZIER) {
			return 'bezier-bezier';
		}

		return 'unsupported';
	}

	function calcOutgoingControlPoint(tweenData, property, keyIndex) {
		var outgoingEase = property.keyOutTemporalEase(keyIndex);
		var outgoingSpeed = outgoingEase[0].speed;
		var outgoingInfluence = outgoingEase[0].influence / 100;

		var m = outgoingSpeed / framerate; // Slope
		var x = tweenData.durationFrames * outgoingInfluence;
		var b = tweenData.startValue; // Y-intercept
		var y = (m * x) + b;

		var correctedX = tweenData.startFrame + x;
		return new Point(correctedX, y);
	}

	function calcIncomingControlPoint(tweenData, property, keyIndex) {
		var incomingEase = property.keyInTemporalEase(keyIndex + 1);
		var incomingSpeed = incomingEase[0].speed;
		var incomingInfluence = incomingEase[0].influence / 100;

		var m = Math.abs(incomingSpeed) / framerate; // Slope
		var x = tweenData.durationFrames * incomingInfluence;
		var b = tweenData.endValue; // Y-intercept
		var y = (m * x) + b;

		var correctedX = tweenData.endFrame - x;
		return new Point(correctedX, y);
	}
})();
