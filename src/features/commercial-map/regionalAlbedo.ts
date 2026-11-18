// Ground and elevated roofs sample the same registered optical coverage.
export const regionalAlbedo = `
  uniform sampler2D landscapeFrontage;
  uniform sampler2D landscapeNear;
  uniform sampler2D landscapeMid;
  uniform sampler2D landscapeFar;
  vec3 registeredAlbedo(vec2 metres) {
    float radius = length(metres);
    vec3 ground;
    float edge = max(abs(metres.x), abs(metres.y));
    if (edge < 638.) {
      ground = texture2D(landscapeFrontage, metres / 1280. + .5).rgb;
      if (edge > 560.) ground = mix(ground, texture2D(landscapeNear, metres / 4096. + .5).rgb,
        smoothstep(560., 638., edge));
    } else if (radius < 1990.) {
      ground = texture2D(landscapeNear, metres / 4096. + .5).rgb;
      if (radius > 1450.) ground = mix(ground, texture2D(landscapeMid, metres / 8192. + .5).rgb,
        smoothstep(1450., 1990., radius));
    } else if (radius < 3980.) {
      ground = texture2D(landscapeMid, metres / 8192. + .5).rgb;
      if (radius > 3450.) ground = mix(ground, texture2D(landscapeFar, metres / 50000. + .5).rgb,
        smoothstep(3450., 3980., radius));
    } else ground = texture2D(landscapeFar, metres / 50000. + .5).rgb;
    return ground;
  }
`;
