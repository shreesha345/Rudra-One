import numpy as np

# G.711 u-law (mu-law) lookup table for decoding
# Source: https://github.com/python/cpython/blob/main/Modules/audioop.c
_st_ulaw2linear16 = np.array([
    -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
    -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
    -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
    -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
    -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
    -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
    -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
    -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
    -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
    -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
    -876, -844, -812, -780, -748, -716, -684, -652,
    -620, -588, -556, -524, -492, -460, -428, -396,
    -372, -356, -340, -324, -308, -292, -276, -260,
    -244, -228, -212, -196, -180, -164, -148, -132,
    -120, -112, -104, -96, -88, -80, -72, -64,
    -56, -48, -40, -32, -24, -16, -8, 0,
    32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
    23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
    15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
    11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
    7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
    5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
    3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
    2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
    1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
    1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
    876, 844, 812, 780, 748, 716, 684, 652,
    620, 588, 556, 524, 492, 460, 428, 396,
    372, 356, 340, 324, 308, 292, 276, 260,
    244, 228, 212, 196, 180, 164, 148, 132,
    120, 112, 104, 96, 88, 80, 72, 64,
    56, 48, 40, 32, 24, 16, 8, 0
], dtype=np.int16)

def lin2ulaw(fragment, width=2):
    """
    Convert linear PCM samples to u-law.
    Matches audioop.lin2ulaw(fragment, width=2).
    """
    if width != 2:
        raise ValueError("Only width=2 (16-bit PCM) is supported")
    
    # Convert bytes to int16 numpy array
    pcm = np.frombuffer(fragment, dtype=np.int16)
    
    # 1. Downshift to 14-bit (drop 2 LSBs)
    pcm_val = pcm >> 2
    
    # 2. Sign and Magnitude
    sign_mask = np.where(pcm_val < 0, 0x7F, 0xFF).astype(np.uint8)
    pcm_val = np.abs(pcm_val)
    
    # 3. Bias (BIAS=132 for 16-bit, so 33 for 14-bit)
    pcm_val = pcm_val + 33
    
    # 4. Segment search
    seg_uend = np.array([0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF, 0x1FFF], dtype=np.int16)
    seg = np.searchsorted(seg_uend, pcm_val, side='left')
    
    # 5. Assemble u-law byte
    # Handle out of range (seg >= 8)
    out_of_range = seg >= 8
    
    # Calculate uval for in-range
    shifted = np.right_shift(pcm_val, seg + 1)
    quant = shifted & 0xF
    uval = (seg << 4) | quant
    
    # If out of range, clamp to max (which results in 0x7F before mask)
    uval = np.where(out_of_range, 0x7F, uval).astype(np.uint8)
    
    # Apply mask (inverts bits)
    result = uval ^ sign_mask
    
    return result.tobytes()

def ulaw2lin(fragment, width=2):
    """
    Convert u-law samples to linear PCM.
    Matches audioop.ulaw2lin(fragment, width=2).
    """
    if width != 2:
        raise ValueError("Only width=2 (16-bit PCM) is supported")
    
    # Convert bytes to uint8 numpy array (u-law bytes)
    ulaw = np.frombuffer(fragment, dtype=np.uint8)
    
    # Lookup
    pcm = _st_ulaw2linear16[ulaw]
    
    return pcm.tobytes()

def mul(fragment, width, factor):
    """
    Multiply samples by a factor.
    Matches audioop.mul(fragment, width, factor).
    """
    if width != 2:
        raise ValueError("Only width=2 (16-bit PCM) is supported")
    data = np.frombuffer(fragment, dtype=np.int16)
    result = np.clip(data * factor, -32768, 32767).astype(np.int16)
    return result.tobytes()

def ratecv(fragment, width, nchannels, inrate, outrate, state, weightA=1, weightB=0):
    """
    Convert frame rate.
    Matches audioop.ratecv(fragment, width, nchannels, inrate, outrate, state, weightA, weightB).
    """
    if width != 2:
        raise ValueError("Only width=2 (16-bit PCM) is supported")
    if nchannels != 1:
        raise ValueError("Only mono supported")
        
    data = np.frombuffer(fragment, dtype=np.int16)
    
    if inrate == outrate:
        return fragment, None
        
    # Calculate number of output samples
    out_len = int(len(data) * outrate / inrate)
    
    # Linear interpolation
    x = np.arange(len(data))
    x_new = np.linspace(0, len(data) - 1, out_len)
    
    new_data = np.interp(x_new, x, data).astype(np.int16)
    
    return new_data.tobytes(), None
