/**
 * redis.js
 *
 * Copyright 2019. All Rights Reserved.
 *
 * Created: February 04, 2019
 * Authors: Toki Migimatsu
 */

function htmlForm(key, val, set, del) {
	set = false || set;
	del = false || del;
	let form = "<a name='" + key + "'></a><form data-key='" + key + "'><div class='keyval-card'>\n";
	form += "\t<div class='key-header'>\n";
	form += "\t\t<label title='" + key + "'>" + key + "</label>\n";
	form += "\t\t<div class='buttons'>\n";
	if (del) {
		form += "\t\t\t<input type='button' value='Del' class='del' title='Delete key from Redis'>\n";
	}
	if (val !== null) {
		form += "\t\t\t<input type='button' value='Copy' class='copy' title='Copy value to clipboard'>\n";
	}
	if (set) {
		form += "\t\t\t<input type='submit' value='Set' title='Set values in Redis: <enter>'>\n";
	}
	form += "\t\t</div>\n";
	form += "\t</div>\n";
	form += "\t<div class='val-body'>\n";
	if (val === null) {
		form += "\t\t<div class='val-row'>\n";
		form += "\t\t\t<div class='val-binary'>\n";
		form += "\t\t\t\tbinary\n";
		form += "\t\t\t</div>\n";
		form += "\t\t</div>\n";
	} else if (typeof (val) === "string") {
		form += "\t\t<div class='val-row'>\n";
		form += "\t\t\t<div class='val-string'>\n";
		form += "\t\t\t\t<textarea class='val'>" + val + "</textarea>\n";
		form += "\t\t\t</div>\n";
		form += "\t\t</div>\n";
	} else { // val should be a 2D array
		val.forEach((row) => {
			form += "\t\t<div class='val-row'>\n";
			row.forEach((el) => {
				form += "\t\t\t<input class='val' type='text' value='" + el + "'>\n";
			});
			form += "\t\t</div>\n";
		});
	}
	form += "\t</div>\n";
	form += "</div></form>\n";
	return form;
}

export function getKeys() {
	return $("form").map((_, form) => $(form).attr("data-key")).toArray();
}

export function getValue(key) {
	let $form = getForm(key);
	if ($form.find("div.val-string").length > 0) {
		return $form.find("textarea.val").val();
	}
	return $form.find("div.val-row").map(function() {
		return [$(this).find("input.val").map(function() {
			return $(this).val();
		}).get().filter(el => el !== "")];
	}).get();
}

export function formExists(key) {
	let $form = $("form[data-key='" + key + "']");
	return $form.length > 0;
}

export function getForm(key) {
	return $("form[data-key='" + key + "']");
}

export function addForm(key, val, set, del, verbose, callback) {
	let $form = $(htmlForm(key, val, set, del)).hide();
	$form.on("submit", (e) => {
		e.preventDefault();

		let val = getMatrix($form);

		if (callback) {
			callback(key, val);
		} else {
			sendAjax("SET", key, val, verbose);
		}
	});

	const li = "<a href='#" + key + "' title='" + key + "'><li>" + key + "</li></a>";
	let $li = $(li).hide();

	// Find alphabetical ordering
	const keys = $("form").map(function() { return $(this).attr("data-key"); }).get();
	let idx_key;
	for (idx_key = 0; idx_key < keys.length; idx_key++) {
		if (key < keys[idx_key]) break;
	}
	if (idx_key < keys.length) {
		$("form").eq(idx_key).before($form);
		$("#left-col a").eq(idx_key).before($li);
	} else {
		$("#sidebar-keys").append($form);
		$("#left-col ul").append($li)
	}
	$form.slideDown("normal");
	$li.slideDown("normal");
}

export function updateForm(key, val, set, del, verbose) {
	let $form = $("form[data-key='" + key + "']");
	if ($form.length === 0) {
		addForm(key, val, set, del, verbose);
	}

	if (val === null) return;

	// Update string
	const $inputs = $form.find(".val");
	if (typeof (val) === "string") {
		$inputs.eq(0).val(val);
		return;
	}

	// Replace matrix if size has changed
	if (val.length * val[0].length != $inputs.length) {
		var key = $form.attr("data-key");
		var html = htmlForm(key, val);
		$form.html(html);
		return;
	}

	// Update matrix
	let i = 0;
	val.forEach((row) => {
		row.forEach((el) => {
			$inputs.eq(i).val(el);
			i++;
		});
	});
}

export function deleteForm(key) {
	var $form = $("form[data-key='" + key + "']");
	if ($form.length == 0) return;
	$form.slideUp("normal", function() {
		$form.remove();
	});
}

export function getMatrix($form) {
	if ($form.find("div.val-string").length > 0) {
		return $form.find("textarea.val").val();
	}
	return $form.find("div.val-row").map(function() {
		return [$(this).find("input.val").map(function() {
			return parseFloat($(this).val());
		}).get().filter(el => el !== "")];
	}).get();
}

export function fillMatrix(matrix, num) {
	matrix.forEach((row) => {
		row.forEach((el, idx) => {
			row[idx] = num.toString();
		});
	});
}

export function matrixToString(matrix) {
	if (typeof (matrix) === "string") return matrix;
	return matrix.map((row) => row.join(" ")).join("; ");
}

export function stringToMatrix(string, makeNumeric) {
	makeNumeric = false || makeNumeric;
	if (makeNumeric) {
		return string.trim().split(";").map((row) => row.trim().split(" ").map(parseFloat));
	} else {
		return string.trim().split(";").map((row) => row.trim().split(" "));
	}
}

export function isNumeric(string) {
	return !isNaN(parseFloat(string));
}

export function makeNumeric(arr) {
	if (typeof (arr) === "string" || arr.length === 0) return arr;
	if (typeof (arr[0]) === "string") {
		return arr.map(parseFloat);
	} else {
		return arr.map((row) => row.map(parseFloat));
	}
}

export function matrixDim(val) {
	if (typeof (val) === "string") return "";
	return [val.length, val[0].length].toString();
}

// Send updated key-val pair via POST
export function sendAjax(command, key, val, verbose) {
	let data = {};
	if (command == "DEL") {
		data[key] = "";
	} else if (command == "SET") {
		data[key] = JSON.stringify(val);
	} else {
		return;
	}

	if (verbose) {
		console.log(data);
	}

	$.ajax({
		method: "POST",
		url: "/" + command,
		data: data
	});
}

/**
 * Parse websocket data format.
 */
function parsePayload(buffer, idx) {
	// Parse payload type
	const type = new DataView(buffer, idx).getUint8() & 0b01111111;
	idx += 1;

	// Parse payload size
	let lenPayload = new DataView(buffer, idx).getUint8();
	idx += 1;
	if (lenPayload == 126) {
		// Medium payload size
		lenPayload = new DataView(buffer, idx).getUint16();
		idx += 2;
	} else if (lenPayload == 127) {
		// Large payload size
		if (DataView.prototype.getBigUint64 === undefined) {
			DataView.prototype.getBigUint64 = function(byteOffset, littleEndian) {
				// split 64-bit number into two 32-bit parts
				byteOffset = byteOffset || 0;
				littleEndian = littleEndian || false;
				const left = this.getUint32(byteOffset, littleEndian);
				const right = this.getUint32(byteOffset + 4, littleEndian);

				// combine the two 32-bit values
				const combined = littleEndian ? left + 2 ** 32 * right : 2 ** 32 * left + right;

				if (!Number.isSafeInteger(combined))
					console.warn(combined, 'exceeds MAX_SAFE_INTEGER. Precision may be lost');

				return combined;
			}
		}
		lenPayload = Number(new DataView(buffer, idx).getBigUint64());
		idx += 8;
	}

	// Parse payload
	if (type == 1) {
		// String
		let payload = new Uint8Array(buffer, idx, lenPayload);
		return [idx + lenPayload, String.fromCharCode.apply(null, new Uint8Array(payload))];
	} else if (type == 2) {
		// Binary
		let payload = buffer.slice(idx, idx + lenPayload);
		return [idx + lenPayload, payload];
	}
}

export function parseMessage(buffer) {
	let idx = 0;

	// Parse number of keys to update
	const numUpdates = new DataView(buffer, idx).getUint32();
	idx += 4;

	let updateKeyVals = {};
	for (let i = 0; i < numUpdates; i++) {
		// Parse key
		const idxKey = parsePayload(buffer, idx);
		idx = idxKey[0];
		const key = idxKey[1];

		// Parse val
		const idxVal = parsePayload(buffer, idx);
		idx = idxVal[0];
		const val = idxVal[1];

		updateKeyVals[key] = val;
	}

	// Parse number of keys to delete
	const numDeletes = (new DataView(buffer, idx)).getUint32();
	idx += 4;

	let deleteKeys = [];
	for (let i = 0; i < numDeletes; i++) {
		// Parse key
		const idxKey = parsePayload(buffer, idx);
		idx = idxKey[0];
		const key = idxKey[1];

		deleteKeys.push(key);
	}

	return {
		toUpdate: updateKeyVals,
		toDelete: deleteKeys
	};
}

let CV_TYPES = {
	"0": "CV_8UC1",
	"8": "CV_8UC2",
	"16": "CV_8UC3",
	"24": "CV_8UC4",
	"2": "CV_16UC1",
	"10": "CV_16UC2",
	"18": "CV_16UC3",
	"26": "CV_16UC4",
	"5": "CV_32FC1",
	"13": "CV_32FC2",
	"11": "CV_32FC3",
	"29": "CV_32FC4",
}

export function bufferToHex(buffer) {
	function convert(b) {
		if (32 <= b && b < 128) {
			return String.fromCharCode(b);
		} else {
			return "\\x" + b.toString(16).padStart(2, "0");
		}
	}
	return [...new Uint8Array(buffer)].map(convert).join("")
}

function getWord(data_view, idx) {
	let chars = [];
	while (idx < data_view.byteLength) {
		const char = String.fromCharCode(data_view.getUint8(idx++));
		if (char == " ") break;
		chars.push(char);
	}
	const word = chars.join("");

	return [word, idx];
}

function getImageType(data_view, idx) {
	let word;
	[word, idx] = getWord(data_view, idx);
	const type = word == "(" ? "tensor" : CV_TYPES[word];

	return [type, idx];
}

function getTensorShape(data_view, idx) {
	let shape = [];
	var word;
	while (idx < data_view.byteLength) {
		[word, idx] = getWord(data_view, idx);
		if (word == ")") break;
		shape.push(parseInt(word));
	}

	return [shape, idx];
}

export function parseImageOrTensor(array_buffer) {
	const data_view = new DataView(array_buffer);

	// Parse opencv_mat message
	let [type, idx] = getImageType(data_view, 0);

	if (type.startsWith("CV_32FC")) {
		// Parse size.
		idx = getWord(data_view, idx)[1];
		const buffer_exr = array_buffer.slice(idx);

		const exr_loader = new THREE.EXRLoader();
		const exr = exr_loader.parse(buffer_exr);

		const len_row = exr.data.length / exr.height;
		const num_channels = len_row / exr.width;
		const shape = [exr.height, exr.width, num_channels];

		// EXR loader loads the image with the y-axis flipped.
		const img = new Float32Array(exr.data.length);
		for (let y = 0; y < exr.height; y++) {
			const idx_src = len_row * (exr.height - 1 - y);
			const idx_dest = len_row * y;
			const img_row = exr.data.subarray(idx_src, idx_src + len_row);
			img.set(img_row, idx_dest);
		}

		return new Promise((resolve, reject) => {
			resolve([img, shape]);
		});
	} else if (type.startsWith("CV_")) {
		// Parse size.
		idx = getWord(data_view, idx)[1];
		const buffer_fast_png = new Uint8Array(array_buffer, idx);
		const png = FastPng.decode(buffer_fast_png);
		const shape = [png.height, png.width, png.channels];

		return new Promise((resolve, reject) => {
			resolve([png.data, shape]);
		});
		// const dv = new DataView(opencv_mat);
		// numCols = dv.getUint32(idx_buffer_prefix + 16);
		// numRows = dv.getUint32(idx_buffer_prefix + 20);
		// numChannels = 4;
		//
		// let buffer_png = buffer_prefix.subarray(idx_buffer_prefix);
		// let png_data = "";
		// for (let i = 0; i < buffer_png.byteLength; i++) {
		// 	png_data += String.fromCharCode(buffer_png[i]);
		// }
		//
		// promise_img = new Promise((resolve, reject) => {
		// 	let image = new Image(numCols, numRows);
		// 	image.onload = () => {
		// 		let canvas = document.createElement("canvas");
		// 		canvas.width = image.width;
		// 		canvas.height = image.height;
		// 		let ctx = canvas.getContext("2d");
		// 		ctx.drawImage(image, 0, 0);
		// 		const img_data = ctx.getImageData(0, 0, image.width, image.height);
		// 		resolve(img_data.data);
		// 	}
		// 	image.src = "data:image/png;base64," + window.btoa(png_data);
		// });
	} else if (type == "tensor") {
		let shape, dtype, cls, element_size;
		[shape, idx] = getTensorShape(data_view, idx);
		[dtype, idx] = getWord(data_view, idx);

		let img;
		if (dtype == "bool") {
			// Unpack bits.
			img = new Uint8Array(shape.reduce((a, b) => a * b, 1));
			for (let idx_byte = 0; idx_byte < data_view.byteLength - idx; idx_byte++) {
				const byte = data_view.getUint8(idx + idx_byte);
				for (let idx_bit = 0; idx_bit < 8; idx_bit++) {
					const bit = (byte >> (7 - idx_bit)) & 0x01;
					img[idx_byte * 8 + idx_bit] = bit;
				}
			}
		} else {
			switch (dtype) {
				case "uint8":
					cls = Uint8Array;
					element_size = 1;
					break;
				case "int8":
					cls = Int8Array;
					element_size = 1;
					break;
				case "uint16":
					cls = Uint16Array;
					element_size = 2;
					break;
				case "int16":
					cls = Int16Array;
					element_size = 2;
					break;
				case "int32":
					cls = Int32Array;
					element_size = 4;
					break;
				case "float32":
					cls = Float32Array;
					element_size = 4;
					break;
				case "float64":
					cls = Float64Array;
					element_size = 8;
					break;
				default:
					throw new Error("Unsupported dtype " + dtype);
			}
			img = (idx % element_size == 0) ? new cls(array_buffer, idx) : new cls(array_buffer.slice(idx));
		}

		return new Promise((resolve, reject) => {
			resolve([img, shape]);
		});
	}

	// Returns a promise because png loading isn't synchronous.
	return promise_img;
}
