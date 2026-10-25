#!/usr/bin/env python3
"""
Checks that every class, method and field the Endcord core dex references exists at runtime on the oldest
supported device: Android 7 (API 24), the Kotlin stdlib 1.5.21 that the installer ships, and Discord 126.21.

A missing reference compiles fine (the core is compiled against newer stubs) but crashes with
NoClassDefFoundError / NoSuchMethodError on the device, so this catches what the compiler can't.

  python scripts/check-runtime-refs.py <Endcord.zip or classes.dex> <android.jar (API 24)> <jar>...

List the jars in runtime class loading order: the injector first (it is classes.dex of the patched app and
overrides some kotlin classes), then Discord's jar (its own copy of parts of the Kotlin stdlib wins over the
installer's kotlin.dex), then kotlin-stdlib 1.5.21 and Aliuhook. A class found in an earlier jar hides later ones,
exactly like on the device.

Reports references that can't be resolved. References to newer Android APIs are fine when the code checks
Build.VERSION.SDK_INT first, so review those by hand.
"""
import struct
import sys
import zipfile
from collections import defaultdict


# ---------------------------------------------------------------- dex
def uleb(data, off):
    result, shift = 0, 0
    while True:
        b = data[off]
        off += 1
        result |= (b & 0x7F) << shift
        if b < 0x80:
            return result, off
        shift += 7


def read_dex(data):
    def section(off):
        return struct.unpack_from("<II", data, off)

    string_size, string_off = section(0x38)
    type_size, type_off = section(0x40)
    proto_size, proto_off = section(0x48)
    field_size, field_off = section(0x50)
    method_size, method_off = section(0x58)
    class_size, class_off = section(0x60)

    def string(i):
        off = struct.unpack_from("<I", data, string_off + i * 4)[0]
        _, off = uleb(data, off)
        end = data.index(b"\0", off)
        return data[off:end].decode("utf-8", "replace")

    types = [string(struct.unpack_from("<I", data, type_off + i * 4)[0]) for i in range(type_size)]

    def type_list(off):
        if off == 0:
            return []
        n = struct.unpack_from("<I", data, off)[0]
        return [types[struct.unpack_from("<H", data, off + 4 + i * 2)[0]] for i in range(n)]

    protos = []
    for i in range(proto_size):
        _, ret, params = struct.unpack_from("<III", data, proto_off + i * 12)
        protos.append("(" + "".join(type_list(params)) + ")" + types[ret])

    methods = []
    for i in range(method_size):
        cls, proto, name = struct.unpack_from("<HHI", data, method_off + i * 8)
        methods.append((types[cls], string(name), protos[proto]))

    fields = []
    for i in range(field_size):
        cls, typ, name = struct.unpack_from("<HHI", data, field_off + i * 8)
        fields.append((types[cls], string(name), types[typ]))

    defined = set()
    for i in range(class_size):
        cls = struct.unpack_from("<I", data, class_off + i * 32)[0]
        defined.add(types[cls])
    return types, methods, fields, defined


# ---------------------------------------------------------------- class files
class ClassInfo:
    __slots__ = ("name", "super", "interfaces", "methods", "fields")


def read_class(data):
    if data[:4] != b"\xca\xfe\xba\xbe":
        return None
    off = 10
    count = struct.unpack_from(">H", data, 8)[0]
    pool = [None] * count
    i = 1
    while i < count:
        tag = data[off]
        if tag == 1:
            length = struct.unpack_from(">H", data, off + 1)[0]
            pool[i] = data[off + 3:off + 3 + length].decode("utf-8", "replace")
            off += 3 + length
        elif tag in (3, 4):
            off += 5
        elif tag in (5, 6):
            off += 9
            i += 1
        elif tag in (7, 8, 16, 19, 20):
            pool[i] = ("ref", struct.unpack_from(">H", data, off + 1)[0])
            off += 3
        elif tag in (9, 10, 11, 12, 18, 17):
            off += 5
        elif tag == 15:
            off += 4
        else:
            raise ValueError("bad constant pool tag %d" % tag)
        i += 1

    def cls_name(idx):
        if idx == 0:
            return None
        return "L" + pool[pool[idx][1]] + ";"

    info = ClassInfo()
    this, sup, icount = struct.unpack_from(">HHH", data, off + 2)
    info.name = cls_name(this)
    info.super = cls_name(sup)
    off += 8
    info.interfaces = [cls_name(struct.unpack_from(">H", data, off + j * 2)[0]) for j in range(icount)]
    off += icount * 2

    def members():
        nonlocal off
        n = struct.unpack_from(">H", data, off)[0]
        off += 2
        out = set()
        for _ in range(n):
            _, name, desc, attrs = struct.unpack_from(">HHHH", data, off)
            off += 8
            for _ in range(attrs):
                length = struct.unpack_from(">I", data, off + 2)[0]
                off += 6 + length
            out.add((pool[name], pool[desc]))
        return out

    info.fields = members()
    info.methods = members()
    return info


def load_jars(paths):
    classes = {}
    for path in paths:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            inner = [n for n in names if n.endswith("classes.jar")]  # .aar
            for n in names:
                if n.endswith(".class") and not n.startswith("META-INF/versions/"):
                    info = read_class(z.read(n))
                    if info and info.name not in classes:
                        classes[info.name] = info
            for n in inner:
                import io
                with zipfile.ZipFile(io.BytesIO(z.read(n))) as zz:
                    for m in zz.namelist():
                        if m.endswith(".class"):
                            info = read_class(zz.read(m))
                            if info and info.name not in classes:
                                classes[info.name] = info
    return classes


def main():
    dex_path, android_jar, *jars = sys.argv[1:]
    if dex_path.endswith(".zip"):
        with zipfile.ZipFile(dex_path) as z:
            dex = b"".join(z.read(n) for n in z.namelist() if n.endswith(".dex"))
            dexes = [z.read(n) for n in z.namelist() if n.endswith(".dex")]
    else:
        dexes = [open(dex_path, "rb").read()]

    env = load_jars([android_jar] + jars)
    android = load_jars([android_jar])

    defined, method_refs, field_refs = set(), set(), set()
    for data in dexes:
        _, methods, fields, d = read_dex(data)
        defined |= d
        method_refs |= set(methods)
        field_refs |= set(fields)

    def find(cls, kind, name, desc, seen=None):
        """Looks for a member in a class and everything it inherits from."""
        if cls is None:
            return False
        seen = seen if seen is not None else set()
        if cls in seen:
            return False
        seen.add(cls)
        if cls in defined:
            return True  # declared in the core itself, the compiler checked it
        info = env.get(cls)
        if info is None:
            return None
        members = info.methods if kind == "m" else info.fields
        if kind == "m":
            if (name, desc) in members:
                return True
            # Signature polymorphic and array clone calls
            if cls == "Ljava/lang/invoke/MethodHandle;" or name == "clone":
                return True
        elif any(n == name for n, _ in members):
            return True
        for parent in [info.super] + info.interfaces:
            r = find(parent, kind, name, desc, seen)
            if r:
                return True
        return False

    missing_classes = defaultdict(int)
    missing_members = []
    for kind, refs in (("m", method_refs), ("f", field_refs)):
        for cls, name, desc in sorted(refs):
            if cls.startswith("["):
                continue
            if cls in defined:
                continue
            r = find(cls, kind, name, desc)
            if r is None:
                missing_classes[cls] += 1
            elif not r:
                newer_android = cls in android or cls.startswith("Landroid/") or cls.startswith("Ljava/")
                missing_members.append((cls, name, desc, newer_android))

    print("== Classes not found anywhere (%d)" % len(missing_classes))
    for cls, n in sorted(missing_classes.items()):
        print("  %s  (%d refs)" % (cls, n))
    print("== Members not found (%d)" % len(missing_members))
    for cls, name, desc, platform in missing_members:
        print("  %s%s->%s%s" % ("[platform] " if platform else "", cls, name, desc))


if __name__ == "__main__":
    main()
