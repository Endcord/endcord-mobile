pluginManagement {
    repositories {
        google()
        gradlePluginPortal()
        maven {
            name = "aliucord"
            url = uri("https://maven.aliucord.com/releases")
        }
    }
}

@Suppress("UnstableApiUsage")
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven {
            name = "aliucord"
            url = uri("https://maven.aliucord.com/releases")
        }
    }
}

include(":Endcord")
include(":Injector")
include(":patches")
include(":kotlin-stdlib")

rootProject.name = "Endcord"
