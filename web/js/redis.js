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
  } else if (typeof(val) === "string") {
    form += "\t\t<div class='val-row'>\n";
    form += "\t\t\t<div class='val-string'>\n";
    form += "\t\t\t\t<textarea class='val'>" + val + "</textarea>\n";
    form += "\t\t\t</div>\n";
    form += "\t\t</div>\n";
  } else { // val should be a 2D array
    val.forEach((row, idx_row) => {
      form += "\t\t<div class='val-row'>\n";
      row.forEach((el, idx) => {
        form += "\t\t\t<input class='val' type='text' value='" + el + "'>\n";
      });
      form += "\t\t</div>\n";
    });
  }
  form += "\t</div>\n";
  form += "</div></form>\n";
  return form;
}

export function formExists(key) {
  let $form = $("form[data-key='" + key + "']");
  return $form.length > 0;
}

export function getForm(key) {
  return $("form[data-key='" + key + "']");
}

export function addForm(key, val, set, del, verbose, callback) {
  let $form = $("form[data-key='" + key + "']");

  $form = $(htmlForm(key, val, set, del)).hide();
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
  if (typeof(val) === "string") {
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
  if (typeof(matrix) === "string") return matrix;
  return matrix.map((row) => row.join(" ")).join("; ");
}

export function matrixDim(val) {
  if (typeof(val) === "string") return "";
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

