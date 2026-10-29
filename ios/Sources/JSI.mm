#import "JSI.h"
#import "Utils.h"
#import "Logger.h"

using namespace facebook;

namespace {

std::string nsStringToStd(NSString *value)
{
    if (!value)
    {
        return std::string();
    }

    const char *utf8 = value.UTF8String;
    return utf8 ? std::string(utf8) : std::string();
}

class NSDataBuffer : public jsi::Buffer
{
public:
    explicit NSDataBuffer(NSData *data) : data_(data) {}

    size_t size() const override
    {
        return data_.length;
    }

    const uint8_t *data() const override
    {
        return static_cast<const uint8_t *>(data_.bytes);
    }

private:
    NSData *data_;
};

}

@implementation JSI

+ (jsi::Value)fromObjC:(id)value runtime:(jsi::Runtime &)runtime
{
    if (!value || value == [NSNull null])
    {
        return jsi::Value::null();
    }

    if ([value isKindOfClass:[NSString class]])
    {
        return jsi::String::createFromUtf8(runtime, nsStringToStd((NSString *) value));
    }

    if ([value isKindOfClass:[NSNumber class]])
    {
        CFTypeID numType = CFGetTypeID((__bridge CFTypeRef) value);
        if (numType == CFBooleanGetTypeID())
        {
            return jsi::Value([(NSNumber *) value boolValue]);
        }
        return jsi::Value([(NSNumber *) value doubleValue]);
    }

    if ([value isKindOfClass:[NSArray class]])
    {
        NSArray   *array = (NSArray *) value;
        jsi::Array out(runtime, array.count);
        for (NSUInteger i = 0; i < array.count; i++)
        {
            out.setValueAtIndex(runtime, i, [JSI fromObjC:array[i] runtime:runtime]);
        }
        return out;
    }

    if ([value isKindOfClass:[NSDictionary class]])
    {
        NSDictionary *dict = (NSDictionary *) value;
        jsi::Object   out(runtime);

        for (id key in dict)
        {
            if (![key isKindOfClass:[NSString class]])
            {
                continue;
            }

            out.setProperty(runtime, jsi::PropNameID::forUtf8(runtime, nsStringToStd((NSString *) key)),
                            [JSI fromObjC:dict[key] runtime:runtime]);
        }

        return out;
    }

    return jsi::Value::null();
}

+ (id)toObjC:(const jsi::Value &)value runtime:(jsi::Runtime &)runtime
{
    return [JSI toObjC:value runtime:runtime depth:0];
}

// A depth limit for objects that hold themselves, which would otherwise recurse until the stack runs out
+ (id)toObjC:(const jsi::Value &)value runtime:(jsi::Runtime &)runtime depth:(int)depth
{
    if (depth > 32)
    {
        throw jsi::JSError(runtime, "The value is nested too deeply to pass to the loader");
    }
    if (value.isUndefined() || value.isNull())
    {
        return [NSNull null];
    }
    if (value.isBool())
    {
        return @(value.getBool());
    }
    if (value.isNumber())
    {
        return @(value.getNumber());
    }
    if (value.isString())
    {
        return [JSI toNSString:value runtime:runtime];
    }
    if (value.isObject())
    {
        jsi::Object obj = value.asObject(runtime);
        if (obj.isArray(runtime))
        {
            jsi::Array arr = obj.asArray(runtime);
            size_t size = arr.size(runtime);
            NSMutableArray *res = [NSMutableArray arrayWithCapacity:size];
            for (size_t i = 0; i < size; ++i)
            {
                jsi::Value val = arr.getValueAtIndex(runtime, i);
                [res addObject:[JSI toObjC:val runtime:runtime depth:depth + 1]];
            }
            return res;
        }
        else if (obj.isFunction(runtime))
        {
            return [NSNull null];
        }
        else
        {
            jsi::Array propNames = obj.getPropertyNames(runtime);
            size_t size = propNames.size(runtime);
            NSMutableDictionary *res = [NSMutableDictionary dictionaryWithCapacity:size];
            for (size_t i = 0; i < size; ++i)
            {
                jsi::String propName = propNames.getValueAtIndex(runtime, i).asString(runtime);
                std::string nameStr = propName.utf8(runtime);
                jsi::Value val = obj.getProperty(runtime, propName);
                NSString *key = [NSString stringWithUTF8String:nameStr.c_str()];
                if (key) res[key] = [JSI toObjC:val runtime:runtime depth:depth + 1];
            }
            return res;
        }
    }
    return [NSNull null];
}

+ (NSString *)toNSString:(const jsi::Value &)value runtime:(jsi::Runtime &)runtime
{
    if (value.isString())
    {
        std::string utf8 = value.asString(runtime).utf8(runtime);
        return [[NSString alloc] initWithBytes:utf8.data() length:utf8.size() encoding:NSUTF8StringEncoding] ?: @"";
    }

    return nil;
}

+ (BOOL)toBool:(const jsi::Value &)value runtime:(jsi::Runtime &)runtime fallback:(BOOL)fallback
{
    if (value.isBool())
    {
        return value.getBool();
    }

    if (value.isNumber())
    {
        return value.getNumber() != 0;
    }

    if (value.isString())
    {
        NSString *raw = [JSI toNSString:value runtime:runtime];
        NSString *s   = [raw lowercaseString];
        if ([s isEqualToString:@"true"] || [s isEqualToString:@"1"] || [s isEqualToString:@"yes"])
        {
            return true;
        }
        if ([s isEqualToString:@"false"] || [s isEqualToString:@"0"] || [s isEqualToString:@"no"])
        {
            return false;
        }
    }

    return fallback;
}

+ (double)toNumber:(const jsi::Value &)value fallback:(double)fallback
{
    return value.isNumber() ? value.getNumber() : fallback;
}

+ (jsi::Value)makeFunction:(const char *)name
                  argCount:(unsigned int)argCount
                   runtime:(jsi::Runtime &)runtime
                   handler:(const jsi::HostFunctionType &)handler
{
    return jsi::Function::createFromHostFunction(runtime, jsi::PropNameID::forUtf8(runtime, name),
                                                 argCount, handler);
}

+ (NSString *)evaluate:(NSData *)scriptData tag:(NSString *)tag runtime:(jsi::Runtime &)runtime
{
    if (scriptData.length == 0)
    {
        return @"The script is empty";
    }

    try
    {
        if (isHermesBytecode(scriptData))
        {
            auto buffer   = std::make_shared<NSDataBuffer>(scriptData);
            auto prepared = runtime.prepareJavaScript(buffer, std::string(tag.UTF8String));
            runtime.evaluatePreparedJavaScript(prepared);
        }
        else
        {
            std::string source((const char *) scriptData.bytes, scriptData.length);
            auto        buffer = std::make_shared<jsi::StringBuffer>(std::move(source));
            runtime.evaluateJavaScript(buffer, std::string(tag.UTF8String));
        }
    }
    catch (const jsi::JSError &e)
    {
        BunnyLog(@"[JSI] evaluate error: JSError for '%@': %s", tag, e.what());
        return [NSString stringWithUTF8String:e.getMessage().c_str()] ?: @"JavaScript error";
    }
    catch (const std::exception &e)
    {
        BunnyLog(@"[JSI] evaluate error: exception for '%@': %s", tag, e.what());
        return [NSString stringWithUTF8String:e.what()] ?: @"Error";
    }
    return nil;
}

@end
