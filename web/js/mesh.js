/**
 * mesh.js
 *
 * Copyright 2023. All Rights Reserved.
 *
 * Created: Aug 3, 2023
 * Authors: Toki Migimatsu
 */

import * as Redis from "./redis.js"

export function create(model_key, model, loadCallback) {
	const positions = new Float32Array(3 * model.max_num_vertices);
	const normals = new Float32Array(3 * model.max_num_vertices);
	const indices = Array.from(new Uint16Array(3 * model.max_num_triangles));
	console.log(model_key, positions, normals, indices);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	if (model.key_normals != "") {
		geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
	}
	geometry.setIndex(indices);
	geometry.setDrawRange(0, 0);
	const material = new THREE.MeshNormalMaterial();
	let mesh = new THREE.Mesh(geometry, material);
	mesh.redisgl = {
		model: model,
		model_key: model_key,
	}

	loadCallback(mesh);
	return mesh;
}

export function updateMeshVertices(mesh, opencv_mat, renderCallback) {
	if (opencv_mat.constructor !== ArrayBuffer) return false;
	Redis.parseImageOrTensor(opencv_mat).then((result) => {
		const array = result[0];
		const positions = mesh.geometry.getAttribute("position");
		positions.array.set(array);

		positions.needsUpdate = true;
		// mesh.geometry.getAttribute("normal").needsUpdate = true;
		// mesh.geometry.index.needsUpdate = true;

		if (mesh.geometry.index !== null) {
			renderCallback();
		}
	});
	return false;
}

export function updateMeshNormals(mesh, buffer, renderCallback) {
	if (buffer.constructor !== ArrayBuffer) return false;
	Redis.parseImageOrTensor(buffer).then((result) => {
		const array = result[0];
		const normals = mesh.geometry.getAttribute("normal");
		normals.array.set(array, 0);

		normals.needsUpdate = true;
		// mesh.geometry.getAttribute("position").needsUpdate = true;
		// mesh.geometry.index.needsUpdate = true;

		if (mesh.geometry.index !== null) {
			renderCallback();
		}
	});
	return false;
}

export function updateMeshIndices(mesh, opencv_mat, renderCallback) {
	if (opencv_mat.constructor !== ArrayBuffer) return false;
	Redis.parseImageOrTensor(opencv_mat).then((result) => {
		const array = result[0];
		const indices = mesh.geometry.index;
		indices.array.set(array);
		mesh.geometry.setDrawRange(0, array.length);
		if (mesh.redisgl.model.key_normals == "") {
			mesh.geometry.computeVertexNormals();
		}

		indices.needsUpdate = true;
		// mesh.geometry.getAttribute("position").needsUpdate = true;
		// mesh.geometry.getAttribute("normal").needsUpdate = true;

		if (mesh.geometry.getAttribute("position") !== undefined) {
			renderCallback();
		}
	});
	return false;
}

export function updatePosition(mesh, val) {
	const pos = Redis.makeNumeric(val[0]);
	mesh.position.fromArray(pos);
	return true;
}

export function updateOrientation(mesh, val) {
	const quat = Redis.makeNumeric(val[0]);
	mesh.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
	return true;
}
