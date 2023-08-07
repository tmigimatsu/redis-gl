/**
 * image.js
 *
 * Copyright 2023. All Rights Reserved.
 *
 * Created: July 31, 2023
 * Authors: Toki Migimatsu
 */

import * as Redis from "./redis.js"

export function create(model_key, model, loadCallback) {
	const image = {
		model: model,
		model_key: model_key,
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

function addCanvas(key) {
	let $a = $(htmlCanvas(key));
	$("#sidebar-images").append($a);

	let $canvas = getCanvas(key);
	let canvas = $canvas[0];
	canvas.raw_img = document.createElement("canvas");
	canvas.raw_segmentations = []
	canvas.num_segmentations = 0;
	canvas.segmentation_areas = [];
	return $canvas;
}

function getCanvas(key) {
	return $("canvas[data-key='" + key + "']");
}

export function drawImage(canvas) {
	let ctx = canvas.getContext("2d");
	ctx.drawImage(canvas.raw_img, 0, 0, canvas.width, canvas.height);

	const segmentation_areas = canvas.segmentation_areas.slice(0, 1 + canvas.num_segmentations);
	const idx_sorted = segmentation_areas
		.map((area, idx) => [area, idx])
		.sort((area_idx_a, area_idx_b) => area_idx_b[0] - area_idx_a[0])  // Sort areas in descending order.
		.map(area_idx => area_idx[1]);
	for (const idx_seg of idx_sorted) {
		ctx.drawImage(canvas.raw_segmentations[idx_seg], 0, 0, canvas.width, canvas.height);
	}
}


function buffer2rgba(image_buffer, dim) {
	if (dim[2] == 4) return image_buffer;

	let orig_image_buffer = image_buffer;
	image_buffer = new Uint8ClampedArray(4 * orig_image_buffer.length / dim[2]);
	for (let i = 0; i < orig_image_buffer.length / dim[2]; i++) {
		if (dim[2] == 3) {
			image_buffer[4 * i] = orig_image_buffer[dim[2] * i];
			image_buffer[4 * i + 1] = orig_image_buffer[dim[2] * i + 1];
			image_buffer[4 * i + 2] = orig_image_buffer[dim[2] * i + 2];
		} else if (orig_image_buffer instanceof Float32Array || orig_image_buffer instanceof Uint16Array) {
			const d = 0.1 * orig_image_buffer[dim[2] * i];
			image_buffer[4 * i] = d;
			image_buffer[4 * i + 1] = d;
			image_buffer[4 * i + 2] = d;
		} else {
			const v = orig_image_buffer[dim[2] * i];
			image_buffer[4 * i] = v;
			image_buffer[4 * i + 1] = v;
			image_buffer[4 * i + 2] = v;
		}
		image_buffer[4 * i + 3] = 255;
	}

	return image_buffer;
}

export function renderImage(image_name, image_buffer, dim) {
	let $canvas = getCanvas(image_name);
	if ($canvas.length === 0) {
		$canvas = addCanvas(image_name);
	}

	const canvas = $canvas[0];
	canvas.height = canvas.width * dim[0] / dim[1];

	image_buffer = buffer2rgba(image_buffer, dim);
	const img_data = new ImageData(image_buffer, dim[1], dim[0]);
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
	const rng = random(10000 * seed);
	return hsv2rgb(103 * seed % 360, 0.2 + 0.8 * rng(), 0.9 + 0.1 * rng());
}

export function renderImageSegmentation(segmentation_model, image_buffer, shape) {
	if (shape.length === 2) {
		shape = [1, shape[0], shape[1]];
	}

	let $canvas = getCanvas(segmentation_model.model_key);
	if ($canvas.length === 0) {
		$canvas = addCanvas(segmentation_model.model_key);
	}
	const canvas = $canvas[0];
	canvas.num_segmentations = shape[0];
	for (let i = canvas.raw_segmentations.length; i < shape[0]; i++) {
		canvas.raw_segmentations.push(document.createElement("canvas"));
		canvas.segmentation_areas.push(0);
	}
	canvas.height = canvas.width * shape[1] / shape[2];

	const len_seg = shape[1] * shape[2];
	for (let idx_seg = 0; idx_seg < shape[0]; idx_seg++) {
		const c = generateRandomColor(idx_seg);
		const rgba_buffer = new Uint8ClampedArray(4 * len_seg);
		let seg_area = 0;
		for (let i = 0; i < len_seg; i++) {
			const val = image_buffer[idx_seg * len_seg + i] > 0;
			const mask = 255 * val;
			rgba_buffer[4 * i + 0] = mask * c[0];
			rgba_buffer[4 * i + 1] = mask * c[1];
			rgba_buffer[4 * i + 2] = mask * c[2];
			rgba_buffer[4 * i + 3] = 0.8 * mask;
			seg_area += val;
		}
		canvas.segmentation_areas[idx_seg] = seg_area;
		const img_data = new ImageData(rgba_buffer, shape[2], shape[1]);
		const raw_segmentation = canvas.raw_segmentations[idx_seg];
		raw_segmentation.width = shape[2];
		raw_segmentation.height = shape[1];
		raw_segmentation.getContext("2d").putImageData(img_data, 0, 0);
	}

	drawImage(canvas);
}

export function updateImage(image, array_buffer, renderCallback) {
	if (array_buffer.constructor !== ArrayBuffer) return false;
	Redis.parseImageOrTensor(array_buffer).then((result) => {
		const [img, shape] = result;
		renderImage(image.model_key, img, shape);
	});
	return false;
}


export function updateImageSegmentation(image, array_buffer, renderCallback) {
	if (array_buffer.constructor !== ArrayBuffer) return false;
	Redis.parseImageOrTensor(array_buffer).then((result) => {
		const [img, shape] = result;
		renderImageSegmentation(image, img, shape);
	});
	return false;
}

