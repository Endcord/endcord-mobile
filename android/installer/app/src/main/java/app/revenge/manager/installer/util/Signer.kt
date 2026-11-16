package app.revenge.manager.installer.util

import android.content.Context
import com.android.apksig.ApkSigner
import app.revenge.manager.BuildConfig
import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.asn1.x509.SubjectPublicKeyInfo
import org.bouncycastle.cert.X509v3CertificateBuilder
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import java.io.File
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.cert.Certificate
import java.security.cert.X509Certificate
import java.util.Date
import java.util.Locale
import kotlin.io.path.Path
import kotlin.io.path.moveTo

object Signer : KoinComponent {
    private val password = "password".toCharArray()
    private val context by inject<Context>()
    private val cacheDir = context.cacheDir
    private val filesDir = context.filesDir

    val keyStore: File by lazy {
        val ks = filesDir.resolve("ks.keystore")
        migrate(cacheDir, filesDir)
        // An empty file is a key that was never written (the app stopped while making it), so nothing was signed with
        // it yet and a new one can take its place. Any other file is the key Endcord is signed with: replacing it would
        // stop every update of the installed Endcord, so it is kept even when it can't be read.
        if (ks.exists() && ks.length() == 0L) ks.delete()
        if (!ks.exists()) newKeystore(ks)
        ks
    }

    private val signerConfig: ApkSigner.SignerConfig by lazy {
        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType())

        this.keyStore.inputStream().use { stream ->
            keyStore.load(stream, null)
        }

        val alias = keyStore.aliases().nextElement()
        val certificate = keyStore.getCertificate(alias) as X509Certificate

        ApkSigner.SignerConfig.Builder(
            BuildConfig.MOD_NAME,
            keyStore.getKey(alias, password) as PrivateKey,
            listOf(certificate)
        ).build()
    }

    /** Writes a new key to [out] whole or not at all: written next to it, synced, then renamed into place */
    private fun newKeystore(out: File) {
        val key = createKey()
        val temp = File(out.path + ".tmp")

        with(KeyStore.getInstance(KeyStore.getDefaultType())) {
            load(null, password)
            setKeyEntry("alias", key.privateKey, password, arrayOf<Certificate>(key.publicKey))
            temp.outputStream().use { stream ->
                store(stream, password)
                stream.fd.sync()
            }
        }
        if (!temp.renameTo(out)) {
            temp.delete()
            error("Unable to save the signing key")
        }
    }

    private fun createKey(): KeySet {
        var serialNumber: BigInteger

        do serialNumber = SecureRandom().nextInt().toBigInteger()
        while (serialNumber < BigInteger.ZERO)

        val x500Name = X500Name("CN=${BuildConfig.MOD_NAME} Manager")
        val pair = KeyPairGenerator.getInstance("RSA").run {
            initialize(2048)
            generateKeyPair()
        }
        val builder = X509v3CertificateBuilder(
            /* issuer = */ x500Name,
            /* serial = */
            serialNumber,
            /* notBefore = */
            Date(System.currentTimeMillis() - 1000L * 60L * 60L * 24L * 30L),
            /* notAfter = */
            Date(System.currentTimeMillis() + 1000L * 60L * 60L * 24L * 366L * 30L),
            /* dateLocale = */
            Locale.ENGLISH,
            /* subject = */
            x500Name,
            /* publicKeyInfo = */
            SubjectPublicKeyInfo.getInstance(pair.public.encoded)
        )
        val signer = JcaContentSignerBuilder("SHA256withRSA").build(pair.private)

        return KeySet(
            JcaX509CertificateConverter().getCertificate(builder.build(signer)),
            pair.private
        )
    }

    fun signApk(apkFile: File, output: File) {
        val outputApk = cacheDir.resolve(apkFile.name)

        ApkSigner.Builder(listOf(signerConfig))
            .setV1SigningEnabled(false) // TODO: enable so api <24 devices can work, however zip-alignment breaks
            .setV2SigningEnabled(true)
            .setV3SigningEnabled(true)
            .setInputApk(apkFile)
            .setOutputApk(output)
            .build()
            .sign()

        outputApk.renameTo(apkFile)
    }

    /** Moves a key kept where older versions did into place, unless a key is there already: that one is in use */
    private fun migrate(oldDir: File, newDir: File) {
        val old = oldDir.resolve("ks.keystore")
        val current = newDir.resolve("ks.keystore")
        if (old.exists() && old.length() > 0 && !(current.exists() && current.length() > 0)) {
            Path(old.absolutePath).moveTo(Path(current.absolutePath), overwrite = true)
        }
    }

    private class KeySet(val publicKey: X509Certificate, val privateKey: PrivateKey)
}