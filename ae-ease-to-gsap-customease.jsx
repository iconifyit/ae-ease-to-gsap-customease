(function () {
	'use strict';

	// Set to true to turn on logging in ExtendScript Toolkit
	var debug = false;

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

	if (curItem === null || !(curItem instanceof CompItem)) {
		alert('Please Select a Comp');
		return;
	}

	// Set to true to clamp Infinite values to ± 10
	var clampInfiniteValues = true;

	// Set to true to output as array of bezier values:
	//		[0.42,0.00,0.58,1.00],[0.68,-0.55,0.27,1.55]
	// or false to output as GSAP curve:
	// 		M0,0C10.08,0,13.92,-100,24,-100C40.32,-45,30.48,-255,48,-200
	var outputAsBezierCurveArray = false;

	var framerate = curItem.frameRate;
	var selectedProperties = curItem.selectedProperties;

	if (selectedProperties.length === 0) {
		alert('Please Select at least one Property (Scale, Opacity, etc)');
		return;
	}

	for (var f = 0; f < selectedProperties.length; f++) {
		var currentProperty = selectedProperties[f];

		if (outputAsBezierCurveArray) {
			var bezierCurveArrayString = buildBezierCurveArrayString(selectedProperties[0]);

			log(bezierCurveArrayString);
			log();
			log();
			copyTextToClipboard(bezierCurveArrayString);
			alert('Copied to clipboard:\n' + bezierCurveArrayString);
		} else {
			var path = getPath(currentProperty);
			if (path === null) {
				continue;
			}

			var pathString = path.toString();
			log(pathString);
			log();
			log();
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

	function buildBezierCurveArrayString (property) {
		var bezierCurveArray = [];
		for (var i = 1, il = property.numKeys; i < il; i++) {
			bezierCurveArray.push(getBezierVals(property, i, i+1));
		}

		return "[" + bezierCurveArray.join("],[") + "]";
	}

	function getNormalizedCurve (tweenData, p0, p1) {
		function normalize (val, min, max) {
			var delta = max - min;
			var normalized = (val - min)/delta;

			// Clamps infinite values. Optional.
			if (clampInfiniteValues) {
				if (normalized === Number.NEGATIVE_INFINITY)
					normalized = -10;
				if (normalized === Number.POSITIVE_INFINITY)
					normalized = 10;
			}

			return normalized;
		}

		var x1 = normalize(p0.x, tweenData.startFrame, tweenData.endFrame).toFixed(2);
		var y1 = normalize(p0.y, tweenData.startValue, tweenData.endValue).toFixed(2);

		if (isNaN(y1)) y1 = x1;

		var x2 = normalize(p1.x, tweenData.startFrame, tweenData.endFrame).toFixed(2);
		var y2 = normalize(p1.y, tweenData.startValue, tweenData.endValue).toFixed(2);

		if (isNaN(y2)) y2 = x2;

		return [x1, y1, x2, y2];
	}

	function getBezierVals (prop, startIndex, endIndex) {
		var tweenData = calcTweenData(prop, startIndex, endIndex);
		var outgoingPoint = calcOutgoingControlPoint(tweenData, prop, startIndex);
		var incomingPoint = calcIncomingControlPoint(tweenData, prop, startIndex);


		return getNormalizedCurve(tweenData, outgoingPoint, incomingPoint);
	}

	function getPath(property) {
		if (property.numKeys <= 1) {
			return null;
		}

		var curveStartFrame = property.keyTime(1) * framerate;
		var curveStartValue;

		if (property.value instanceof Array) {
			curveStartValue = property.keyValue(1)[0];
		} else {
			curveStartValue = property.keyValue(1);
		}

		// The path data we output is in SVG path format: https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths
		// Moves the drawing pen to the start point of the path.
		var path = new Path(curveStartFrame, curveStartValue);

		for (var i = 1; i < property.numKeys; i++) {
			var command = getCommand(property, i);
			path.commands.push(command);

			log();
		}

		var endPoint = path.getEndPoint();
		if (endPoint.y > curveStartValue) {
			path.invertYAxis();
		}
		return path;
	}

	function getCommand(property, keyIndex) {
		var command;
		var tweenData = calcTweenData(property, keyIndex, keyIndex + 1);
		var easeType = calcEaseType(property, keyIndex, keyIndex + 1);
		log('easeType: ' + easeType);

		// For linear eases, just draw a line. (L x y)
		if (easeType === 'linear-linear') {
			command = new PathCommand('L', tweenData.endFrame, tweenData.endValue);
			return command;
		}

		if (easeType === 'unsupported') {
			log('UNSUPPORTED EASING PAIR!');
			alert('This keyframe pair uses an unsupported pair of ease types, results may be inaccurate.');
		}

		command = new PathCommand('C');
		command.points.push(
			calcOutgoingControlPoint(tweenData, property, keyIndex),
			calcIncomingControlPoint(tweenData, property, keyIndex),
			new Point(tweenData.endFrame, tweenData.endValue) // End anchor point.
		);
		return command;
	}

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

		var m = -incomingSpeed / framerate; // Slope
		var x = tweenData.durationFrames * incomingInfluence;
		var b = tweenData.endValue; // Y-intercept
		var y = (m * x) + b;

		var correctedX = tweenData.endFrame - x;
		return new Point(correctedX, y);
	}

	function log(string) {
		if (debug) {
			$.writeln(string || '');
		}
	}
})();
