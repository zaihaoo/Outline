precision highp float;
uniform sampler2D texture;
uniform vec2 pixelSize;
uniform vec4 color;
varying vec2 texCoord;
uniform float u_size;


void main()
{
    // gl_FragCoord和trxCoord坐标都可以使用 只是texture2D需要注意归一化
    vec2 p = gl_FragCoord.xy;
    // vec2 p = texCoord.xy;
    vec4 textureColor = texture2D(texture, (p) / u_size);
    gl_FragColor = textureColor;
}