/**
 * graphics.js
 *
 * Copyright 2019. All Rights Reserved.
 *
 * Created: February 04, 2019
 * Authors: Toki Migimatsu
 */

export function parse(graphicsStruct, body, promises) {

  if (graphicsStruct.geometry.type == "mesh") {

    var mesh_filename = graphicsStruct.geometry.mesh;
    var webapp = location.pathname.split("/").pop();
    webapp = webapp.substr(0, webapp.lastIndexOf("."));
    var dir  = "resources/" + webapp + "/" + mesh_filename.substr(0, mesh_filename.lastIndexOf("/") + 1);
    var file = mesh_filename.substr(mesh_filename.lastIndexOf("/") + 1);

    var promise_mtllibs = new Promise((resolve, reject) => {
      new THREE.OBJLoader()
        .setPath(dir)
        .load(file, (obj) => {
          resolve(obj.materialLibraries);
        }, null, reject);
    });

    var promise_mtl = new Promise((resolve, reject) => {
      promise_mtllibs.then((mtllibs) => {
        // TODO: Support only one material resource for now
        var mtllib = mtllibs[0];
        new THREE.MTLLoader()
          .setPath(dir)
          .load(mtllib, (mtl) => {
            mtl.preload();
            resolve(mtl);
          }, null, reject);
      });
    });

    var promise_obj = new Promise((resolve, reject) => {
      promise_mtl.then((mtl) => {
        new THREE.OBJLoader()
          .setMaterials(mtl)
          .setPath(dir)
          .load(file, resolve, null, reject);
      });
    });

    promises.push(new Promise((resolve, reject) => {
      promise_obj.then((obj) => {
        obj.quaternion.set(graphicsStruct.quat.x, graphicsStruct.quat.y, graphicsStruct.quat.z, graphicsStruct.quat.w);
        obj.position.fromArray(graphicsStruct.pos);
        obj.scale.fromArray(graphicsStruct.geometry.scale);
        body.add(obj);
        resolve();
      });
    }));

  } else if (graphicsStruct.geometry.type == "box") {

    var box;
    if (body.children.length == 0) {

      var geometry = new THREE.BoxGeometry();
      var material = new THREE.MeshNormalMaterial();
      material.transparent = true;
      box = new THREE.Mesh(geometry, material);
      body.add(box);

    } else {

      box = body.children[0];

      if (box.geometry.type != "BoxGeometry") {
        box.geometry.dispose();
        box.geometry = new THREE.BoxGeometry();
      }

    }

    box.material.opacity = graphicsStruct.material.rgba[3];
    box.material.needsUpdate = true;
    box.quaternion.set(graphicsStruct.quat.x, graphicsStruct.quat.y, graphicsStruct.quat.z, graphicsStruct.quat.w);
    box.position.fromArray(graphicsStruct.pos);
    box.scale.fromArray(graphicsStruct.geometry.scale);

  } else if (graphicsStruct.geometry.type == "sphere") {

    let sphere;
    if (body.children.length === 0) {
      let geometry = new THREE.SphereGeometry(1, 16, 16);
      let material = new THREE.MeshNormalMaterial();
      material.transparent = true;
      sphere = new THREE.Mesh(geometry, material);
      body.add(sphere);
    } else {
      sphere = body.children[0];
      if (sphere.geometry.type != "SphereGeometry") {
        sphere.geometry.dispose();
        sphere.geometry = new THREE.SphereGeometry(1, 16, 16);
      }
    }

    sphere.material.opacity = graphicsStruct.material.rgba[3];
    sphere.material.needsUpdate = true;
    sphere.quaternion.set(graphicsStruct.quat.x, graphicsStruct.quat.y, graphicsStruct.quat.z, graphicsStruct.quat.w);
    sphere.position.fromArray(graphicsStruct.pos);
    sphere.scale.setScalar(graphicsStruct.geometry.radius);

  }

}

export function axes(size, line_width, colors) {
  colors = colors || [0xff0000, 0x00ff00, 0x0000ff];

  let xyz = new THREE.Object3D();

  let x_material = new MeshLineMaterial({
    color: new THREE.Color(colors[0]),
    lineWidth: line_width
  });
  let x_geometry = new THREE.Geometry();
  x_geometry.vertices.push(new THREE.Vector3(0, 0, 0));
  x_geometry.vertices.push(new THREE.Vector3(size, 0, 0));
  let x_line = new MeshLine();
  x_line.setGeometry(x_geometry);
  let x = new THREE.Mesh(x_line.geometry, x_material)

  let y_material = new MeshLineMaterial({
    color: new THREE.Color(colors[1]),
    lineWidth: line_width
  });
  let y_geometry = new THREE.Geometry();
  y_geometry.vertices.push(new THREE.Vector3(0, 0, 0));
  y_geometry.vertices.push(new THREE.Vector3(0, size, 0));
  let y_line = new MeshLine();
  y_line.setGeometry(y_geometry);
  let y = new THREE.Mesh(y_line.geometry, y_material)

  let z_material = new MeshLineMaterial({
    color: new THREE.Color(colors[2]),
    lineWidth: line_width
  });
  let z_geometry = new THREE.Geometry();
  z_geometry.vertices.push(new THREE.Vector3(0, 0, 0));
  z_geometry.vertices.push(new THREE.Vector3(0, 0, size));
  let z_line = new MeshLine();
  z_line.setGeometry(z_geometry);
  let z = new THREE.Mesh(z_line.geometry, z_material)

  xyz.add(x);
  xyz.add(y);
  xyz.add(z);
  return xyz;
}
