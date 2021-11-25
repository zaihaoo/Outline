#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform sampler2D texture;
uniform vec4 color;
varying vec2 texCoord;
uniform vec2 u_size;

const int w = 2;

// 首先根据w计算卷积核(Kernel)的矩阵 譬如2就是5x5的矩阵 3就是7x7的矩阵 由列矩阵[]
const int level = w + (w + 1);
const int size = level * level;

vec3 calcGrads(vec2 p) {
    // 因为后面计算图片的灰度值是float型 所以这里必须是float型 后面才能参与计算
    float KBlur[size];

    // for (int r = 0; r < size; r++) {
    //     KBlur[r] = 1.0 / float(size);
    // }


    // 直接使用5x5标准差为1.4的高斯卷积核
    KBlur[0] = 2.0/129.0;
    KBlur[1] = 4.0/129.0;
    KBlur[2] = 5.0/129.0;
    KBlur[3] = 4.0/129.0;
    KBlur[4] = 2.0/129.0;

    KBlur[5] = 4.0/129.0;
    KBlur[6] = 9.0/129.0;
    KBlur[7] = 12.0/129.0;
    KBlur[8] = 4.0/129.0;
    KBlur[9] = 9.0/129.0;

    KBlur[10] = 5.0/129.0;
    KBlur[11] = 12.0/129.0;
    KBlur[12] = 15.0/129.0;
    KBlur[13] = 12.0/129.0;
    KBlur[14] = 5.0/129.0;


    KBlur[15] = 4.0/129.0;
    KBlur[16] = 9.0/129.0;
    KBlur[17] = 12.0/129.0;
    KBlur[18] = 4.0/129.0;
    KBlur[19] = 9.0/129.0;

    KBlur[20] = 2.0/129.0;
    KBlur[21] = 4.0/129.0;
    KBlur[22] = 5.0/129.0;
    KBlur[23] = 4.0/129.0;
    KBlur[24] = 2.0/129.0;

    // 计算当前像素以及周围像素的灰度值 注意上面计算卷积核的数组是从矩阵左上开始的
    vec3 grayArray[size];

    for (int r = w; r >= -w; r--) {
        for (int c = -w; c <= w; c++) {

            // p 点如果是通过gl_FragCoord.xy取值的 则都需要进行归一化 gl_FragCoord.xy是以viewport视口的大小为参考
            vec4 textureColor = texture2D(texture, (p + vec2(c, r)) / u_size);


            // p 点如果是通过texCoord.xy取值的 则只需要对改变量进行归一化 因为贴图坐标texCoord是经过了varying变量在0到1之间进行插值的 
            // vec4 textureColor = texture2D(texture, p + vec2(c, r) / u_size);
            // 由于c是从-w开始的所以这里和上面有所不同 []中的算法只是为了索引自增
            // grayArray[(w - r) * level + (c + w)] = 0.3 * textureColor.r + 0.6 * textureColor.g + 0.1 * textureColor.b;

            grayArray[(w - r) * level + (c + w)] = textureColor.rgb;
        }
    }


    // 开始计算当前像素的卷积
    // float G = 0.0;
    vec3 G = vec3(0.,0.,0.);
    for (int index = 0; index < size; index++) {
        G += KBlur[index] * grayArray[index];
    }

    return G;
}

void main()
{
    // gl_FragCoord和trxCoord坐标都可以使用 只是texture2D需要注意归一化
    vec2 p = gl_FragCoord.xy;

    vec4 textureColor = texture2D(texture, p / u_size);
    vec4 textureColor1 = texture2D(texture, (p+0.75) / u_size);
    vec4 textureColor2 = texture2D(texture, (p-0.75) / u_size);
    vec4 diff = fwidth(textureColor);
    if (all(equal(diff, vec4(0.,0.,0.,0.))) && textureColor1 == vec4(0.,0.,0.,1.) && textureColor2 == vec4(0.,0.,0.,1.)) {
        discard;
    } 

    // one line code outline
    // gl_FragColor = vec4(vec3(1.0 - pow(fwidth(texture2D(texture, p / vec2(799.5,799.5)))*15.0, vec4(2)).rgb), 1.0);
    // gl_FragColor = vec4(vec3(pow(fwidth(texture2D(texture,gl_FragCoord.xy/799.5))*5.5,vec4 (1.0)).rgb),1.0);

    // vec2 p = texCoord.xy;

    vec3 G = calcGrads(p);

    G = clamp(G, 0.0, 255.0);

    gl_FragColor = vec4(
        G.rgb,
        1.0
    );
}
