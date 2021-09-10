uniform vec2 pixelSize;
attribute vec2 pos;
varying vec2 texCoord;
void main()
{
    texCoord = pos;
    // pos ranges from [(0, 0), (1, 1)], so we need to convert to OpenGL's
    // native coordinates of [(-1, -1], (1, 1)].
    gl_Position = vec4(2.0 * pos.x - 1.0, 2.0 * pos.y - 1.0, 0.0, 1.0);
}