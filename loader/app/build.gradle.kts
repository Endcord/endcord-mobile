plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    jvmToolchain(libs.versions.javaVersion.get().toInt())
}

android {
    namespace = "io.github.revenge.xposed"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.endcord.xposed"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0.0"

        // The published bundle. Pass -Pendcord.bundleUrl=http://10.0.2.2:4040/endcord.min.js to test a local build.
        val bundleUrl = providers.gradleProperty("endcord.bundleUrl")
            .orElse("https://raw.githubusercontent.com/Endcord/endcord-mobile/builds-next/endcord.min.js")
            .get()
        buildConfigField("String", "BUNDLE_URL", "\"$bundleUrl\"")

        // The key signed bundle releases are checked with (bundle/scripts/sign-release.mjs). With requireSigned, a
        // published bundle without a signed release is refused too.
        val releaseKey = providers.gradleProperty("endcord.releaseKey")
            .orElse(providers.fileContents(rootProject.layout.projectDirectory.file("../bundle/release-key.pub")).asText)
            .get().trim()
        buildConfigField("String", "RELEASE_KEY", "\"$releaseKey\"")
        val requireSigned = providers.gradleProperty("endcord.requireSigned").orElse("false").get().toBoolean()
        buildConfigField("boolean", "REQUIRE_SIGNED", requireSigned.toString())
    }

    sourceSets {
        named("main") {
            kotlin.directories += "src/main/kotlin"
        }
    }

    // Release signing is provided by CI through the environment. Without it, release builds are unsigned.
    val keystoreFile = providers.environmentVariable("KEYSTORE_FILE").orNull?.takeIf { it.isNotBlank() }
    if (keystoreFile != null) {
        signingConfigs {
            create("release") {
                storeFile = file(keystoreFile)
                storePassword = providers.environmentVariable("KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
            isMinifyEnabled = false
        }
        release {
            isDebuggable = false
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.toVersion(libs.versions.javaVersion.get())
        targetCompatibility = JavaVersion.toVersion(libs.versions.javaVersion.get())
    }

    buildFeatures {
        buildConfig = true
    }

    testOptions {
        // Logger wraps android.util.Log; return default values so unit tests can run.
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    compileOnly(libs.xposed.api)

    implementation(project(":api"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)

    testImplementation(libs.kotlin.test)
}
