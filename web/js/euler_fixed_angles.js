/**
 * redis-web-gui.js
 *
 * Author: Toki Migimatsu
 * Created: December 2017
 */

import * as graphics from "./graphics.js"
import * as redis from "./redis.js"

var KEY_PREFIX = "cs223a::euler_fixed_angles::";
var KEY_EULER  = "zyx_euler_angles";
var KEY_FIXED  = "xyz_fixed_angles";
var KEY_MATRIX = "matrix";
var AXIS_WIDTH = 0.005;
var AXIS_SIZE  = 0.1;
var FRAME_OFFSET = 0.2;
var ROTATION_RADIUS = 0.03;

$(document).ready(function() {

  let camera, scene, renderer;
  let euler_angles = [0, 0, 0], fixed_angles = [0, 0, 0];
  let new_euler_angles = [0, 0, 0], new_fixed_angles = [0, 0, 0];
  let animation_timer;

  // Copy values to clipboard
  $(document).on("click", "input.copy", function(e) {
    e.preventDefault();

    // Get val
    var $form = $(this).closest("form");
    var val = matrixToString(getMatrix($form));

    // Create temporary input to copy to clipboard
    var $temp = $("<input>");
    $("body").append($temp);
    $temp.val(val).select();
    document.execCommand("copy");
    $temp.remove();
  });

  function init_graphics() {

    var width = window.innerWidth - $("#sidebar").width();
    var height = window.innerHeight;

    camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);
    camera.position.copy(new THREE.Vector3(0.75, -0.75, 0.5));
    camera.up.copy(new THREE.Vector3(0, 0, 1));

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    $("#content").html(renderer.domElement);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.addEventListener("change", function() {
      renderer.render(scene, camera);
    });
    redis.addForm(KEY_MATRIX, [[1, 0, 0],[0, 1, 0],[0, 0, 1]], false, false, false, update);
    redis.addForm(KEY_EULER, [[0, 0, 0]], true, false, false, update);
    redis.addForm(KEY_FIXED, [[0, 0, 0]], true, false, false, update);

    var grid = new THREE.GridHelper(1, 10);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    // scene.add(axes(AXIS_SIZE, AXIS_WIDTH));

    create_euler(0, 0, 0);
    create_fixed(0, 0, 0);

    renderer.render(scene, camera);
  }

  function update(key, val) {
    switch (key) {
      case KEY_EULER:
        new_euler_angles = val[0];
        new_fixed_angles = [val[0][2], val[0][1], val[0][0]];
        {
          let $input = $("form[data-key='" + KEY_FIXED + "']").find("input.val");
          for (let i = 0; i < 3; i++) {
            $input.eq(i).val(new_fixed_angles[i]);
          }
          $input = $("form[data-key='" + KEY_MATRIX + "']").find("input.val");
          let v = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
          let E = new THREE.Euler(new_euler_angles[2], new_euler_angles[1], new_euler_angles[0], "ZYX");
          for (let i = 0; i < 3; i++) {
            v[i].applyEuler(E);
          }
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              $input.eq(3*i+j).val(v[j].toArray()[i]);
            }
          }
        }
        break;
      case KEY_FIXED:
        new_euler_angles = [val[0][2], val[0][1], val[0][0]];
        new_fixed_angles = val[0];
        {
          let $input = $("form[data-key='" + KEY_EULER + "']").find("input.val");
          for (let i = 0; i < 3; i++) {
            $input.eq(i).val(new_euler_angles[i]);
          }
          $input = $("form[data-key='" + KEY_MATRIX + "']").find("input.val");
          let v = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
          let E = new THREE.Euler(new_euler_angles[2], new_euler_angles[1], new_euler_angles[0], "ZYX");
          for (let i = 0; i < 3; i++) {
            v[i].applyEuler(E);
          }
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              $input.eq(3*i+j).val(v[j].toArray()[i]);
            }
          }
        }
        break;
      // case KEY_MATRIX:
      //   let R = new THREE.Matrix3();
      //   R.set(val[0][0], val[0][1], val[0][2],
      //         val[1][0], val[1][1], val[1][2],
      //         val[2][0], val[2][1], val[2][2]);
      //   let E = new THREE.Euler();
      //   E.setFromRotationMatrix(R, "ZYX");
      //   console.log(E);
      //   new_euler_angles = [E.z, E.y, E.x];
      //   new_fixed_angles = [E.x, E.y, E.z];
      //   break;
    }

    // Animate rotation
    var i = 1;
    if (animation_timer) {
      clearInterval(animation_timer);
    }
    animation_timer = setInterval(function() {
      if (i > 100) {
        clearInterval(animation_timer);
        euler_angles = new_euler_angles;
        fixed_angles = new_fixed_angles;
        return;
      }
      var j = i / 100;

      var alpha = (1 - j) * euler_angles[0] + j * new_euler_angles[0];
      var beta  = (1 - j) * euler_angles[1] + j * new_euler_angles[1];
      var gamma = (1 - j) * euler_angles[2] + j * new_euler_angles[2];
      update_euler(alpha, beta, gamma);

      var alpha = (1 - j) * fixed_angles[0] + j * new_fixed_angles[0];
      var beta  = (1 - j) * fixed_angles[1] + j * new_fixed_angles[1];
      var gamma = (1 - j) * fixed_angles[2] + j * new_fixed_angles[2];
      update_fixed(alpha, beta, gamma);

      renderer.render(scene, camera);

      i++;
    }, 10);
  }

  function rotation_arrow(hex_color, line_width, radius) {
    var arrow = new THREE.Object3D();

    var ring_material = new MeshLineMaterial({
      color: new THREE.Color(hex_color),
      lineWidth: line_width
    });
    var ring_geometry = new THREE.Geometry();
    for (var i = 0; i < 3/2 * Math.PI; i += 2 * Math.PI / 32) {
      ring_geometry.vertices.push(new THREE.Vector3(radius * Math.cos(i), radius * Math.sin(i), 0));
    }
    var ring_line = new MeshLine();
    ring_line.setGeometry(ring_geometry);
    var ring = new THREE.Mesh(ring_line.geometry, ring_material)

    var cone_material = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex_color) });
    var cone_geometry = new THREE.ConeGeometry(0.01, 0.03);
    var cone = new THREE.Mesh(cone_geometry, cone_material);
    cone.position.y = -radius;
    cone.rotation.z = -Math.PI / 2 - 0.3;

    var axis_material = new MeshLineMaterial({
      color: new THREE.Color(hex_color),
      lineWidth: line_width
    });
    var axis_geometry = new THREE.Geometry();
    var axis_length = 3/4 * (FRAME_OFFSET - AXIS_SIZE);
    axis_geometry.vertices.push(new THREE.Vector3(0, 0, -axis_length / 2));
    axis_geometry.vertices.push(new THREE.Vector3(0, 0, axis_length / 2));
    var axis_line = new MeshLine();
    axis_line.setGeometry(axis_geometry);
    var axis = new THREE.Mesh(axis_line.geometry, axis_material);

    arrow.add(ring);
    arrow.add(cone);
    arrow.add(axis);
    return arrow;
  }

  function rotation_arrow_x() {
    var arrow_x = rotation_arrow(0xff0000, AXIS_WIDTH, ROTATION_RADIUS);
    arrow_x.rotation.y = Math.PI / 2;
    arrow_x.position.x = -0.05;
    return arrow_x;
  }

  function rotation_arrow_y() {
    var arrow_y = rotation_arrow(0x00ff00, AXIS_WIDTH, ROTATION_RADIUS);
    arrow_y.rotation.x = -Math.PI / 2;
    arrow_y.position.y = -0.05;
    return arrow_y;
  }

  function rotation_arrow_z() {
    var arrow_z = rotation_arrow(0x0000ff, AXIS_WIDTH, ROTATION_RADIUS);
    arrow_z.position.z = -0.05;
    return arrow_z;
  }

  function straight_arrow(from, to) {
    var arrow = new THREE.Object3D();

    var line_material = new THREE.LineBasicMaterial({
      color: new THREE.Color(0xffffff),
    });
    var line_geometry = new THREE.Geometry();
    line_geometry.vertices.push(from.position);
    line_geometry.vertices.push(to.position);
    var line = new THREE.Line(line_geometry, line_material);

    arrow.add(line);
    return arrow;
  }

  function axis_spheres(hex_color) {
    var spheres = new THREE.Object3D();
    var sphere_geometry = new THREE.SphereGeometry(AXIS_WIDTH, 32, 32);
    var sphere_material;
    if (hex_color == null) {
      sphere_material = new THREE.MeshNormalMaterial();
    } else {
      sphere_material = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex_color) });
    }
    var sphere_x = new THREE.Mesh(sphere_geometry, sphere_material);
    sphere_x.position.x = AXIS_SIZE;
    var sphere_y = new THREE.Mesh(sphere_geometry, sphere_material);
    sphere_y.position.y = AXIS_SIZE;
    var sphere_z = new THREE.Mesh(sphere_geometry, sphere_material);
    sphere_z.position.z = AXIS_SIZE;
    spheres.add(sphere_x);
    spheres.add(sphere_y);
    spheres.add(sphere_z);
    return spheres;
  }

  var euler_frames = new THREE.Object3D();
  var fixed_frames = new THREE.Object3D();

  function create_euler(alpha, beta, gamma) {

    var frame_0 = new THREE.Object3D();
    var axes_0 = axes(AXIS_SIZE, AXIS_WIDTH);
    axes_0.add(axis_spheres(0x666666));
    frame_0.add(axes_0);

    var frame_a = new THREE.Object3D();
    var rot_a = new THREE.Euler(0, 0, alpha, "ZYX");
    var pos_a = new THREE.Vector3(0, 0, FRAME_OFFSET);
    frame_a.rotation.copy(rot_a);
    frame_a.position.copy(pos_a);
    var axes_a = axes(AXIS_SIZE, AXIS_WIDTH);
    axes_a.add(axis_spheres(0x666666));
    frame_a.add(axes_a);
    frame_a.add(rotation_arrow_z());

    var frame_b = new THREE.Object3D();
    var rot_b = new THREE.Euler(0, beta, alpha, "ZYX");
    var pos_b = (new THREE.Vector3(0, FRAME_OFFSET, 0)).applyEuler(rot_a).add(pos_a);
    frame_b.rotation.copy(rot_b);
    frame_b.position.copy(pos_b);
    var axes_b = axes(AXIS_SIZE, AXIS_WIDTH);
    axes_b.add(axis_spheres(0x666666));
    frame_b.add(axes_b);
    frame_b.add(rotation_arrow_y());

    var frame_c = new THREE.Object3D();
    var rot_c = new THREE.Euler(gamma, beta, alpha, "ZYX");
    var pos_c = (new THREE.Vector3(FRAME_OFFSET, 0, 0)).applyEuler(rot_b).add(pos_b);
    frame_c.rotation.copy(rot_c);
    frame_c.position.copy(pos_c);
    var axes_c = axes(AXIS_SIZE, AXIS_WIDTH);
    axes_c.add(axis_spheres(0xffffff));

    frame_c.add(axes_c);
    frame_c.add(rotation_arrow_x());

    frame_0.add(straight_arrow(frame_0, frame_c));

    euler_frames.add(frame_0);
    euler_frames.add(frame_a);
    euler_frames.add(frame_b);
    euler_frames.add(frame_c);
    euler_frames.position.copy(new THREE.Vector3(-0.3, -0.3, 0));
    scene.add(euler_frames);

  }

  function create_fixed(alpha, beta, gamma) {

    var frame_0 = new THREE.Object3D();
    var axes_0 = axes(AXIS_SIZE, AXIS_WIDTH);
    axes_0.add(axis_spheres(0x666666));
    frame_0.add(axes_0);

    var frame_a = new THREE.Object3D();
    var rot_a = new THREE.Euler(alpha, 0, 0, "ZYX");
    var pos_a = new THREE.Vector3(FRAME_OFFSET, 0, 0);
    frame_a.position.copy(pos_a);
    var axes_a = axes(AXIS_SIZE, AXIS_WIDTH);
    axes_a.rotation.copy(rot_a);
    axes_a.add(axis_spheres(0x666666));
    frame_a.add(axes_a);
    frame_a.add(rotation_arrow_x());

    var frame_b = new THREE.Object3D();
    var rot_b = new THREE.Euler(alpha, beta, 0, "ZYX");
    var pos_b = new THREE.Vector3(FRAME_OFFSET, FRAME_OFFSET, 0);
    frame_b.position.copy(pos_b);
    var axes_b = axes(AXIS_SIZE, AXIS_WIDTH);
    axes_b.rotation.copy(rot_b);
    axes_b.add(axis_spheres(0x666666));
    frame_b.add(axes_b);
    frame_b.add(rotation_arrow_y());

    var frame_c = new THREE.Object3D();
    var rot_c = new THREE.Euler(alpha, beta, gamma, "ZYX");
    var pos_c = new THREE.Vector3(FRAME_OFFSET, FRAME_OFFSET, FRAME_OFFSET);
    frame_c.position.copy(pos_c);
    var axes_c = axes(AXIS_SIZE, AXIS_WIDTH);
    axes_c.rotation.copy(rot_c);
    axes_c.add(axis_spheres(0xffffff));
    frame_c.add(axes_c);
    frame_c.add(rotation_arrow_z());

    frame_0.add(straight_arrow(frame_0, frame_c));

    fixed_frames.add(frame_0);
    fixed_frames.add(frame_a);
    fixed_frames.add(frame_b);
    fixed_frames.add(frame_c);
    fixed_frames.position.copy(new THREE.Vector3(0, 0, 0));
    scene.add(fixed_frames);

  }

  function update_euler(alpha, beta, gamma) {

    var frame_a = euler_frames.children[1];
    frame_a.rotation.z = alpha;

    var frame_b = euler_frames.children[2];
    frame_b.rotation.y = beta;
    frame_b.rotation.z = alpha;
    frame_b.position.x = 0;
    frame_b.position.y = FRAME_OFFSET;
    frame_b.position.z = 0;
    frame_b.position.applyEuler(frame_a.rotation).add(frame_a.position);

    var frame_c = euler_frames.children[3];
    frame_c.rotation.x = gamma;
    frame_c.rotation.y = beta;
    frame_c.rotation.z = alpha;
    frame_c.position.x = FRAME_OFFSET;
    frame_c.position.y = 0;
    frame_c.position.z = 0;
    frame_c.position.applyEuler(frame_b.rotation).add(frame_b.position);

    var frame_0 = euler_frames.children[0];
    var line_geometry = frame_0.children[1].children[0].geometry;
    line_geometry.vertices[1] = frame_c.position;
    line_geometry.verticesNeedUpdate = true;

  }

  function update_fixed(alpha, beta, gamma) {

    var frame_a = fixed_frames.children[1];
    var axes_a = frame_a.children[0];
    axes_a.rotation.x = alpha;

    var frame_b = fixed_frames.children[2];
    var axes_b = frame_b.children[0];
    axes_b.rotation.x = alpha;
    axes_b.rotation.y = beta;

    var frame_c = fixed_frames.children[3];
    var axes_c = frame_c.children[0];
    axes_c.rotation.x = alpha;
    axes_c.rotation.y = beta;
    axes_c.rotation.z = gamma;

  }

  init_graphics();

  $(window).resize(function() {
    var width = window.innerWidth - $("#sidebar").width();
    var height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.render(scene, camera);
  })

});
