/**
 * image.js
 *
 * Copyright 2023. All Rights Reserved.
 *
 * Created: July 31, 2023
 * Authors: Toki Migimatsu
 */

import * as Camera from "./camera.js"

export function create(model, loadCallback) {
	let segmentations = [];
	for (let i = 0; i < model.key_segmentations.length; i++) {
		segmentations.push({
			key_image: model.key_image,
			key_segmentation: model.key_segmentations[i],
			idx_segmentation: i,
		});
	}
	let image = {
		model: model,
		segmentations: segmentations,
	};
	return image;
}

function htmlCanvas(key) {
	let canvas = "<a name='" + key + "'></a><div data-key='" + key + "'>\n";
	canvas += "\t<div class='key-header'>\n";
	canvas += "\t\t<label title='" + key + "'>" + key + "</label>\n";
	canvas += "\t</div>\n";
	canvas += "\t<canvas data-key='" + key + "'></canvas>\n";
	canvas += "\t</div>\n"
	return canvas;
}

function addCanvas(image_or_camera) {
	const model = image_or_camera.model;
	const key = model.key_image || model.key_color_image
	let $a = $(htmlCanvas(key));
	$("#sidebar-images").append($a);

	let $canvas = getCanvas(key);
	let canvas = $canvas[0];
	canvas.raw_img = document.createElement("canvas");
	canvas.raw_segmentations = []
	if ("segmentations" in image_or_camera) {
		for (let i = 0; i < image_or_camera.segmentations.length; i++) {
			canvas.raw_segmentations.push(document.createElement("canvas"));
		}
	}
	return $canvas;
}

function getCanvas(key) {
	return $("canvas[data-key='" + key + "']");
}

export function drawImage(canvas) {
	let ctx = canvas.getContext("2d");
	ctx.drawImage(canvas.raw_img, 0, 0, canvas.width, canvas.height);
	for (let i = 0; i < canvas.raw_segmentations.length; i++) {
		ctx.drawImage(canvas.raw_segmentations[i], 0, 0, canvas.width, canvas.height);
	}
}

export function renderImage(image, image_buffer, dim) {
	let $canvas = getCanvas(image.model.key_image || image.model.key_color_image);
	if ($canvas.length === 0) {
		$canvas = addCanvas(image);
	}

	let canvas = $canvas[0];
	canvas.height = canvas.width * dim[0] / dim[1];

	if (image_buffer instanceof Float32Array) {
		let float_image_buffer = image_buffer;
		image_buffer = new Uint8ClampedArray(4 * float_image_buffer.length);
		for (let y = 0; y < dim[0]; y++) {
			for (let x = 0; x < dim[1]; x++) {
				const d = 0.1 * float_image_buffer[dim[1] * (dim[0] - y) + x];
				const i = dim[1] * y + x
				image_buffer[4 * i] = d;
				image_buffer[4 * i + 1] = d;
				image_buffer[4 * i + 2] = d;
				image_buffer[4 * i + 3] = 255;
			}
		}
	}
	let img_data = new ImageData(image_buffer, dim[1], dim[0]);
	canvas.raw_img.width = dim[1];
	canvas.raw_img.height = dim[0];
	canvas.raw_img.getContext("2d").putImageData(img_data, 0, 0);
	drawImage(canvas);
}

function random(seed) {
	// From https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript.
	return function() {
		var t = seed += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
}

function hsv2rgb(h, s, v) {
	// From https://en.wikipedia.org/wiki/HSL_and_HSV.
	function f(n) {
		const k = (n + h / 60) % 6;
		return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
	}
	return [f(5), f(3), f(1)];
}

function generateRandomColor(seed) {
	const rng = random(seed);
	return hsv2rgb(360 * rng(), 0.8 * rng() + 0.2, 1.0);
}

export function renderImageSegmentation(segmentation_model, image_buffer, dim) {
	let $canvas = getCanvas(segmentation_model.key_image);
	if ($canvas.length === 0) {
		$canvas = addCanvas(segmentation_model);
	}

	let canvas = $canvas[0];
	canvas.height = canvas.width * dim[0] / dim[1];

	let rgba_buffer = new Uint8ClampedArray(image_buffer.length);
	const c = generateRandomColor(segmentation_model.idx_segmentation);
	for (let i = 0; i < image_buffer.length; i += 4) {
		const mask = 255 * (image_buffer[i] > 0);
		rgba_buffer[i + 0] = mask * c[0];
		rgba_buffer[i + 1] = mask * c[1];
		rgba_buffer[i + 2] = mask * c[2];
		rgba_buffer[i + 3] = 0.8 * mask;
	}
	let img_data = new ImageData(rgba_buffer, dim[1], dim[0]);
	let raw_segmentation = canvas.raw_segmentations[segmentation_model.idx_segmentation];
	raw_segmentation.width = dim[1];
	raw_segmentation.height = dim[0];
	raw_segmentation.getContext("2d").putImageData(img_data, 0, 0);
	drawImage(canvas);
}

var updatingImage = false;

export function updateImage(image, opencv_mat, renderCallback) {
	if (opencv_mat.constructor !== ArrayBuffer) return false;
	if (updatingImage) return false;
	updatingImage = true;
	const [promise_img, dim] = Camera.parseOpenCvMat(opencv_mat);
	promise_img.then((img) => {
		renderImage(image, img, dim);

		updatingImage = false;
	});
	return false;
}


export function updateImageSegmentation(segmentation_model, opencv_mat, renderCallback) {
	if (opencv_mat.constructor !== ArrayBuffer) return false;
	// if (updatingImage) return false;
	// updatingImage = true;
	const [promise_img, dim] = Camera.parseOpenCvMat(opencv_mat);
	promise_img.then((img) => {
		renderImageSegmentation(segmentation_model, img, dim);

		updatingImage = false;
	});
	return false;
}

